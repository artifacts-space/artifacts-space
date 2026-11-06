import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, apiToken, teamMember } from "@/db/schema";
import { tokenUserIsActive } from "@/lib/agents/identity";
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
  return {
    token: secret,
    record: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    },
  };
}

export async function listApiTokens(userId: string) {
  const records = await getDb()
    .select()
    .from(apiToken)
    .where(and(eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
    .orderBy(desc(apiToken.createdAt));

  return records.map((record) => ({
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function revokeApiToken(userId: string, id: string) {
  await getDb()
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)));
}

/**
 * The user id a bearer token acts as, or null. A person's token acts as the
 * person. An agent's token acts as the agent, and only while the agent still
 * belongs to its team.
 */
export async function authenticateApiToken(token: string) {
  const [record] = await getDb()
    .select({ userId: apiToken.userId, id: apiToken.id, agentTeamId: agent.teamId, agentMemberId: teamMember.id })
    .from(apiToken)
    .leftJoin(agent, eq(agent.userId, apiToken.userId))
    .leftJoin(teamMember, and(eq(teamMember.userId, apiToken.userId), eq(teamMember.teamId, agent.teamId)))
    .where(and(eq(apiToken.tokenHash, hashToken(token)), isNull(apiToken.revokedAt)))
    .limit(1);

  if (!record || !tokenUserIsActive(record)) return null;

  await getDb()
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiToken.id, record.id));

  return record.userId;
}
