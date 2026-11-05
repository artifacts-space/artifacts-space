import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { apiToken } from "@/db/schema";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(userId: string, name: string) {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("Give this token a name.");

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

export async function authenticateApiToken(token: string) {
  const [record] = await getDb()
    .select({ userId: apiToken.userId, id: apiToken.id })
    .from(apiToken)
    .where(and(eq(apiToken.tokenHash, hashToken(token)), isNull(apiToken.revokedAt)))
    .limit(1);

  if (!record) return null;

  await getDb()
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiToken.id, record.id));

  return record.userId;
}
