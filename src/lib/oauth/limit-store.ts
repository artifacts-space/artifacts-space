import { and, count, desc, eq, gt, isNull, notExists, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { oauthClient, oauthConsent, oauthRefreshToken } from "@/db/oauth-schema";
import { verification } from "@/db/schema";

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

/**
 * Registered apps nobody approved within the cleanup window: how many there
 * are in all, how many this network registered, and when the oldest of those
 * was registered.
 */
export function unapprovedClientCountsQuery(network: string, now = Date.now()) {
  const since = new Date(now - oauthLimits.unapprovedClientHours * hourMs);
  const fromNetwork = eq(oauthClient.registeredNetwork, network);
  return getDb()
    .select({
      total: count(),
      fromNetwork: sql<number>`count(*) filter (where ${fromNetwork})`.mapWith(Number),
      oldestFromNetwork: sql<Date | null>`min(${oauthClient.createdAt}) filter (where ${fromNetwork})`.mapWith(oauthClient.createdAt),
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
  return { total: row?.total ?? 0, fromNetwork: row?.fromNetwork ?? 0, oldestFromNetwork: row?.oldestFromNetwork ?? null };
}

/** Records which network registered an app, once, right after Better Auth stored it. */
export async function markClientNetwork(clientId: string, network: string): Promise<void> {
  await getDb()
    .update(oauthClient)
    .set({ registeredNetwork: network })
    .where(and(eq(oauthClient.clientId, clientId), isNull(oauthClient.registeredNetwork)));
}
