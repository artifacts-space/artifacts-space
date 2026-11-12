import { and, count, eq, gt, gte, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { oauthClient, oauthConsent, oauthRefreshToken } from "@/db/oauth-schema";

import { oauthLimits } from "./config";
import type { StoredCodeTrace, StoredRefreshGrant } from "./token-limit-rules";
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

const codeTraceSchema = z.object({ kind: z.enum(["code", "token"]), value: z.string() });

/**
 * What the database holds for a presented code, by its hash (hashOAuthToken
 * of the code): Better Auth's verification rows under that identifier, and
 * the clients of tokens issued from it. Indexed lookups only.
 */
export async function findCodeTrace(codeHash: string): Promise<StoredCodeTrace> {
  const result = await getDb().execute(sql`
    (select 'code' as kind, v.value as value from verification v where v.identifier = ${codeHash} limit 5)
    union all
    (select 'token', r.client_id from oauth_refresh_token r where r.authorization_code_id = ${codeHash} limit 1)
    union all
    (select 'token', a.client_id from oauth_access_token a where a.authorization_code_id = ${codeHash} limit 1)
  `);
  const rows = z.array(codeTraceSchema).parse(result.rows);
  return { values: rows.filter((row) => row.kind === "code").map((row) => row.value), tokenClientIds: rows.filter((row) => row.kind === "token").map((row) => row.value) };
}

function poolWindow(now: number) {
  return {
    since: new Date(now - oauthLimits.unapprovedClientHours * hourMs),
    graceCutoff: new Date(now - oauthLimits.unapprovedEvictionGraceMinutes * 60_000),
  };
}

/**
 * Registered apps nobody approved within the cleanup window, for the pool
 * and for this network: how many, how many a new registration could evict
 * (past the grace period, not from a metadata document, holding no tokens),
 * and when the oldest one still inside the grace period was registered.
 */
export function unapprovedClientCountsQuery(network: string, now = Date.now()) {
  const { since, graceCutoff } = poolWindow(now);
  const fromNetwork = eq(oauthClient.registeredNetwork, network);
  const holdsTokens = sql`(exists (select 1 from oauth_refresh_token r where r.client_id = ${oauthClient.clientId}) or exists (select 1 from oauth_access_token a where a.client_id = ${oauthClient.clientId}))`;
  const pastGrace = and(lt(oauthClient.createdAt, graceCutoff), isNull(oauthClient.clientDiscoveryId), sql`not ${holdsTokens}`);
  const inGrace = gte(oauthClient.createdAt, graceCutoff);
  return getDb()
    .select({
      total: count(),
      evictable: sql<number>`count(*) filter (where ${pastGrace})`.mapWith(Number),
      oldestInGrace: sql<Date | null>`min(${oauthClient.createdAt}) filter (where ${inGrace})`.mapWith(oauthClient.createdAt),
      fromNetwork: sql<number>`count(*) filter (where ${fromNetwork})`.mapWith(Number),
      evictableFromNetwork: sql<number>`count(*) filter (where ${and(fromNetwork, pastGrace)})`.mapWith(Number),
      oldestInGraceFromNetwork: sql<Date | null>`min(${oauthClient.createdAt}) filter (where ${and(fromNetwork, inGrace)})`.mapWith(oauthClient.createdAt),
    })
    .from(oauthClient)
    .where(
      and(
        or(gt(oauthClient.createdAt, since), isNull(oauthClient.createdAt)),
        notExists(getDb().select({ one: sql`1` }).from(oauthConsent).where(eq(oauthConsent.clientId, oauthClient.clientId))),
      ),
    );
}

/** Runs unapprovedClientCountsQuery. */
export async function unapprovedClientCounts(network: string, now = Date.now()): Promise<UnapprovedClientCounts> {
  const [row] = await unapprovedClientCountsQuery(network, now);
  return row ?? { total: 0, evictable: 0, oldestInGrace: null, fromNetwork: 0, evictableFromNetwork: 0, oldestInGraceFromNetwork: null };
}

/** Which unapproved apps an eviction works on: the whole pool, or one network's share of it. */
export type EvictionScope = { kind: "pool" } | { kind: "network"; network: string };

function scopeFilter(scope: EvictionScope) {
  return scope.kind === "network" ? sql`and c.registered_network = ${scope.network}` : sql``;
}

function scopeCap(scope: EvictionScope): number {
  return scope.kind === "network" ? oauthLimits.maxUnapprovedClientsPerNetwork : oauthLimits.maxUnapprovedClients;
}

/** Unapproved apps in a scope, as SQL over `oauth_client c`. */
function unapprovedIn(scope: EvictionScope, since: Date) {
  return sql`
    select c.id, c.client_id, c.created_at, c.client_discovery_id
    from oauth_client c
    where (c.created_at > ${since.toISOString()}::timestamp or c.created_at is null)
      and not exists (select 1 from oauth_consent k where k.client_id = c.client_id)
      ${scopeFilter(scope)}`;
}

/** What trimming a scope did: how many older apps it evicted, and whether it dropped the new app instead. */
export interface TrimResult {
  evicted: number;
  dropped: boolean;
}

/**
 * Brings a scope (the pool, or one network's share) back to its cap after
 * `newClientId` registered, in one statement. Apps that can be evicted are
 * those past the grace period that hold no tokens and came from no metadata
 * document, never the new app. The statement keeps the newest of them, as
 * many as the cap leaves room for beside the apps that cannot be evicted,
 * and deletes the rest; when the apps that cannot be evicted already exceed
 * the cap, it deletes the new app instead.
 *
 * Concurrent registrations cannot leave the scope over its cap: each
 * registration is stored before its own trim starts, so the trim that
 * starts last sees every one of them, and keeping the newest (rather than
 * deleting a count) means an earlier trim deletes only rows a later one
 * would. Under a tight race at the cap a trim may count an app another trim
 * is deleting and refuse one registration too many; it never lets one too
 * many through.
 */
export async function trimUnapproved(newClientId: string, scope: EvictionScope, now = Date.now()): Promise<TrimResult> {
  const { since, graceCutoff } = poolWindow(now);
  const result = await getDb().execute(sql`
    with unapproved as (${unapprovedIn(scope, since)}),
    flagged as (
      select u.id, u.client_id, u.created_at, coalesce(
        u.created_at < ${graceCutoff.toISOString()}::timestamp
          and u.client_discovery_id is null
          and u.client_id <> ${newClientId}
          and not exists (select 1 from oauth_refresh_token r where r.client_id = u.client_id)
          and not exists (select 1 from oauth_access_token a where a.client_id = u.client_id),
        false) as evictable
      from unapproved u
    ),
    room as (select ${scopeCap(scope)} - count(*) filter (where not f.evictable) as keep from flagged f),
    ranked as (
      select f.id, row_number() over (order by f.created_at desc, f.id desc) as position
      from flagged f where f.evictable
    ),
    victims as (
      select r.id from ranked r, room where r.position > greatest(room.keep, 0)
      union all
      select f.id from flagged f, room where f.client_id = ${newClientId} and room.keep < 0
    )
    delete from oauth_client d using victims v
    where d.id = v.id and not exists (select 1 from oauth_consent k where k.client_id = d.client_id)
    returning d.client_id
  `);
  const deleted = z.array(z.object({ client_id: z.string() })).parse(result.rows).map((row) => row.client_id);
  const dropped = deleted.includes(newClientId);
  return { evicted: deleted.length - (dropped ? 1 : 0), dropped };
}

/**
 * Forgets which network registered an app once nobody needs it: when the app
 * is approved, and for every app before its registration is a day old (the
 * cleanup job runs every 6 hours and clears tags past
 * oauthLimits.registeredNetworkHours, so none lives past 24 hours). The
 * privacy page promises rate-limit data goes within a day. Returns how many
 * tags it cleared.
 */
export async function clearRegisteredNetworks(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - oauthLimits.registeredNetworkHours * hourMs);
  const result = await getDb().execute(sql`
    update oauth_client c set registered_network = null
    where c.registered_network is not null
      and (c.created_at is null or c.created_at < ${cutoff.toISOString()}::timestamp
        or exists (select 1 from oauth_consent k where k.client_id = c.client_id))
    returning c.client_id
  `);
  return result.rows.length;
}

/**
 * Clears the registering network of apps approved since they registered,
 * among apps young enough to still carry one. Runs after each approval, so a
 * tag is gone as soon as nobody needs it. Returns how many it cleared.
 */
export async function forgetApprovedClientNetworks(now = Date.now()): Promise<number> {
  const since = new Date(now - oauthLimits.registeredNetworkHours * hourMs);
  const result = await getDb().execute(sql`
    update oauth_client c set registered_network = null
    where c.created_at > ${since.toISOString()}::timestamp
      and c.registered_network is not null
      and exists (select 1 from oauth_consent k where k.client_id = c.client_id)
    returning c.client_id
  `);
  return result.rows.length;
}

/** Records which network registered an app, once, right after Better Auth stored it. */
export async function markClientNetwork(clientId: string, network: string): Promise<void> {
  await getDb()
    .update(oauthClient)
    .set({ registeredNetwork: network })
    .where(and(eq(oauthClient.clientId, clientId), isNull(oauthClient.registeredNetwork)));
}
