import { and, count, desc, eq, gt, gte, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { oauthClient, oauthConsent, oauthRefreshToken } from "@/db/oauth-schema";
import { verification } from "@/db/schema";
import { slidingRateLimitCount } from "@/lib/abuse/rate-limit";

import { oauthLimits } from "./config";
import type { StoredCodeGrant, StoredRefreshGrant } from "./token-limit-rules";
import type { UnapprovedClientCounts } from "./registration-limit-rules";

/**
 * The database reads and writes behind the OAuth endpoint limits
 * (token-limits.ts and registration-limits.ts). Kept thin: the decisions are
 * in the *-rules.ts files.
 */

const hourMs = 3_600_000;

/** The stored refresh token with this hash (hashOAuthToken of its secret part), or null. */
export async function findRefreshGrant(tokenHash: string): Promise<StoredRefreshGrant | null> {
  const [row] = await getDb()
    .select({
      userId: oauthRefreshToken.userId,
      clientId: oauthRefreshToken.clientId,
      expiresAt: oauthRefreshToken.expiresAt,
      revoked: oauthRefreshToken.revoked,
      rotationReplayExpiresAt: oauthRefreshToken.rotationReplayExpiresAt,
    })
    .from(oauthRefreshToken)
    .where(eq(oauthRefreshToken.token, tokenHash))
    .limit(1);
  return row ?? null;
}

/**
 * The stored authorization code with this hash (hashOAuthToken of the code),
 * or null. Better Auth keeps codes as verification rows whose identifier is
 * that hash, and deletes the row when the code is used.
 */
export async function findCodeGrant(codeHash: string): Promise<StoredCodeGrant | null> {
  const [row] = await getDb()
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, codeHash))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  return row ?? null;
}

function poolWindow(now: number) {
  return {
    since: new Date(now - oauthLimits.unapprovedClientHours * hourMs),
    graceCutoff: new Date(now - oauthLimits.unapprovedEvictionGraceMinutes * 60_000),
  };
}

/**
 * Registered apps nobody approved within the cleanup window: how many there
 * are in all, how many this network registered and when the oldest of those
 * was registered, how many a new registration could evict, and when the
 * oldest one still inside the grace period was registered.
 */
export function unapprovedClientCountsQuery(network: string, now = Date.now()) {
  const { since, graceCutoff } = poolWindow(now);
  const fromNetwork = eq(oauthClient.registeredNetwork, network);
  const pastGrace = and(lt(oauthClient.createdAt, graceCutoff), isNull(oauthClient.clientDiscoveryId));
  const inGrace = gte(oauthClient.createdAt, graceCutoff);
  return getDb()
    .select({
      total: count(),
      fromNetwork: sql<number>`count(*) filter (where ${fromNetwork})`.mapWith(Number),
      oldestFromNetwork: sql<Date | null>`min(${oauthClient.createdAt}) filter (where ${fromNetwork})`.mapWith(oauthClient.createdAt),
      evictable: sql<number>`count(*) filter (where ${pastGrace})`.mapWith(Number),
      oldestInGrace: sql<Date | null>`min(${oauthClient.createdAt}) filter (where ${inGrace})`.mapWith(oauthClient.createdAt),
    })
    .from(oauthClient)
    .where(
      and(
        or(gt(oauthClient.createdAt, since), isNull(oauthClient.createdAt)),
        notExists(getDb().select({ one: sql`1` }).from(oauthConsent).where(eq(oauthConsent.clientId, oauthClient.clientId))),
      ),
    );
}

/** Runs unapprovedClientCountsQuery, with this network's apps evicted in the last day. */
export async function unapprovedClientCounts(network: string, now = Date.now()): Promise<UnapprovedClientCounts> {
  const [[row], evicted] = await Promise.all([unapprovedClientCountsQuery(network, now), slidingRateLimitCount("oauthEvictedByNetwork", network, now)]);
  const stored = row ?? { total: 0, fromNetwork: 0, oldestFromNetwork: null, evictable: 0, oldestInGrace: null };
  return { ...stored, evictedFromNetwork: Math.ceil(evicted) };
}

const evictedRowSchema = z.object({ client_id: z.string(), registered_network: z.string().nullable() });

/**
 * Brings the pool of unapproved apps back to its cap after a registration,
 * in one statement: deletes as many of the oldest unapproved apps as the pool
 * is over, among those past the grace period that hold no tokens, came from
 * no metadata document, and are not `keepClientId`. Concurrent calls cannot
 * leave the pool over the cap: the last one to start sees every committed
 * registration, and rows another call is deleting are skipped once it
 * commits. Returns the evicted apps and the network that registered each.
 */
export async function evictOldestUnapproved(keepClientId: string, now = Date.now()): Promise<{ clientId: string; network: string | null }[]> {
  const { since, graceCutoff } = poolWindow(now);
  const result = await getDb().execute(sql`
    with unapproved as (
      select c.id, c.client_id, c.created_at, c.client_discovery_id
      from oauth_client c
      where (c.created_at > ${since.toISOString()}::timestamp or c.created_at is null)
        and not exists (select 1 from oauth_consent k where k.client_id = c.client_id)
    ),
    excess as (select greatest(count(*) - ${oauthLimits.maxUnapprovedClients}, 0) as n from unapproved),
    victims as (
      select u.id from unapproved u
      where u.created_at < ${graceCutoff.toISOString()}::timestamp
        and u.client_discovery_id is null
        and u.client_id <> ${keepClientId}
        and not exists (select 1 from oauth_refresh_token r where r.client_id = u.client_id)
        and not exists (select 1 from oauth_access_token a where a.client_id = u.client_id)
      order by u.created_at, u.id
      limit (select n from excess)
    )
    delete from oauth_client d using victims v
    where d.id = v.id and not exists (select 1 from oauth_consent k where k.client_id = d.client_id)
    returning d.client_id, d.registered_network
  `);
  return z.array(evictedRowSchema).parse(result.rows).map((row) => ({ clientId: row.client_id, network: row.registered_network }));
}

/**
 * Deletes the app just registered when the pool is still over its cap (no
 * app was old enough to evict). Returns whether it was deleted; the route
 * then refuses the registration instead.
 */
export async function dropIfPoolOverCap(clientId: string, now = Date.now()): Promise<boolean> {
  const { since } = poolWindow(now);
  const result = await getDb().execute(sql`
    delete from oauth_client d
    where d.client_id = ${clientId}
      and not exists (select 1 from oauth_consent k where k.client_id = d.client_id)
      and (
        select count(*) from oauth_client c
        where (c.created_at > ${since.toISOString()}::timestamp or c.created_at is null)
          and not exists (select 1 from oauth_consent k2 where k2.client_id = c.client_id)
      ) > ${oauthLimits.maxUnapprovedClients}
    returning d.client_id
  `);
  return result.rows.length > 0;
}

/** Records which network registered an app, once, right after Better Auth stored it. */
export async function markClientNetwork(clientId: string, network: string): Promise<void> {
  await getDb()
    .update(oauthClient)
    .set({ registeredNetwork: network })
    .where(and(eq(oauthClient.clientId, clientId), isNull(oauthClient.registeredNetwork)));
}
