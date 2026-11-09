import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpConnection } from "@/db/connection-schema";
import { agent, apiToken, teamMember } from "@/db/schema";
import { tokenUserIsActive } from "@/lib/agents/identity";
import { toConnectionHarness, type ConnectionHarnessDto } from "@/lib/harness/connection-store";
import { UserFacingError } from "@/lib/user-facing-error";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(userId: string, name: string) {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new UserFacingError("Give this token a name.");

  const secret = `artifacts_${randomBytes(24).toString("base64url")}`;
  const [record] = await getDb()
    .insert(apiToken)
    .values({
      id: randomUUID(),
      userId,
      name: cleanName,
      prefix: `${secret.slice(0, 18)}…`,
      tokenHash: hashToken(secret),
    })
    .returning();

  if (!record) throw new Error("The access token could not be created.");
  // A new token has not connected yet, so nothing says which agent it is.
  const harness: ConnectionHarnessDto | null = null;
  return {
    token: secret,
    record: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      harness,
    },
  };
}

/**
 * A token's harness once it has connected (so a client that never names
 * itself can still be given one), named itself, or the person chose one;
 * null for a token never used.
 */
export function tokenHarness(input: { clientName: string | null; override: string | null; used: boolean }): ConnectionHarnessDto | null {
  const { clientName, override, used } = input;
  return used || clientName || override ? toConnectionHarness({ clientName, override }) : null;
}

/** A person's live tokens, newest first, with the agent harness each one was detected as. */
export async function listApiTokens(userId: string) {
  const records = await getDb()
    .select({ token: apiToken, clientName: mcpConnection.clientName, harnessOverride: mcpConnection.harnessOverride })
    .from(apiToken)
    .leftJoin(mcpConnection, eq(mcpConnection.apiTokenId, apiToken.id))
    .where(and(eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
    .orderBy(desc(apiToken.createdAt));

  return records.map(({ token: record, clientName, harnessOverride }) => ({
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    harness: tokenHarness({ clientName, override: harnessOverride, used: record.lastUsedAt !== null }),
  }));
}

/** Revokes one of a person's tokens. What its client said it was, and the agent chosen for it, go too. */
export async function revokeApiToken(userId: string, id: string) {
  await getDb()
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)));
  await getDb().delete(mcpConnection).where(and(eq(mcpConnection.userId, userId), eq(mcpConnection.apiTokenId, id)));
}

/** lastUsedAt is written at most this often per token, so busy agents do not write on every call. */
export const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

/** Whether a token's lastUsedAt is old enough to write again. */
export function lastUsedIsStale(lastUsedAt: Date | null, now: Date): boolean {
  return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS;
}

/**
 * The lookup behind authenticateApiToken: the token's row by hash, only while
 * it is not revoked, with its agent's team membership. Revoking a token (as a
 * handover does, src/lib/agents/handover.ts) stops it at the next request.
 */
export function tokenLookupQuery(db: Pick<ReturnType<typeof getDb>, "select">, tokenHash: string) {
  return db
    .select({ userId: apiToken.userId, id: apiToken.id, lastUsedAt: apiToken.lastUsedAt, agentTeamId: agent.teamId, agentMemberId: teamMember.id })
    .from(apiToken)
    .leftJoin(agent, eq(agent.userId, apiToken.userId))
    .leftJoin(teamMember, and(eq(teamMember.userId, apiToken.userId), eq(teamMember.teamId, agent.teamId)))
    .where(and(eq(apiToken.tokenHash, tokenHash), isNull(apiToken.revokedAt)))
    .limit(1);
}

/**
 * The user a bearer token acts as, and the token's id, or null. A person's
 * token acts as the person. An agent's token acts as the agent, and only
 * while the agent still belongs to its team.
 */
export async function authenticateApiToken(token: string) {
  const [record] = await tokenLookupQuery(getDb(), hashToken(token));

  if (!record || !tokenUserIsActive(record)) return null;

  const now = new Date();
  if (lastUsedIsStale(record.lastUsedAt, now)) {
    await getDb().update(apiToken).set({ lastUsedAt: now }).where(eq(apiToken.id, record.id));
  }
  return { userId: record.userId, tokenId: record.id };
}
