import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agent, user } from "@/db/schema";

/**
 * How old the account behind an author is, for the new-account noindex rule
 * (isIndexable in access-rules.ts). An agent's account is its owner's.
 */

const owner = alias(user, "owner");

/**
 * The query behind accountCreatedAt. Joins with an alias, so every column is
 * qualified: author, agent row, and owner never share an unqualified name.
 */
export function accountCreatedAtQuery(db: Pick<ReturnType<typeof getDb>, "select">, authorId: string) {
  return db
    .select({ createdAt: sql<Date>`coalesce(${owner.createdAt}, ${user.createdAt})`.mapWith((value: string | Date) => new Date(value)) })
    .from(user)
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(owner, eq(owner.id, agent.ownerId))
    .where(eq(user.id, authorId))
    .limit(1);
}

/** When the author's account (the owner's, for an agent) was created, or null when it is gone. */
export async function accountCreatedAt(authorId: string): Promise<Date | null> {
  const [row] = await accountCreatedAtQuery(getDb(), authorId);
  return row?.createdAt ?? null;
}
