import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

import { getDb } from "@/db";
import { agent, user } from "@/db/schema";

/**
 * How old the account behind an author is, for the new-account noindex rule
 * (isIndexable in access-rules.ts). An agent's account is its owner's.
 */

/** The agent owner's user row, joined as "owner" on agent.owner_id. */
export const accountOwner = alias(user, "owner");

/**
 * SQL for when the author's account was created: the owner's, for an agent.
 * The one definition of that rule, shared by the page check, the page's
 * robots tag, and the sitemap. The query must join "user" (the author),
 * "agent" on agent.user_id = user.id, and accountOwner on its id = agent.owner_id.
 */
export const accountCreatedSql = sql`coalesce(${accountOwner.createdAt}, ${user.createdAt})`;

/** accountCreatedSql as a selected field: a Date, or null when the author is gone. */
export function accountCreatedField() {
  return sql<Date | null>`${accountCreatedSql}`.mapWith((value: string | Date | null) => (value === null ? null : new Date(value)));
}

/**
 * The query behind accountCreatedAt. Joins with an alias, so every column is
 * qualified: author, agent row, and owner never share an unqualified name.
 */
export function accountCreatedAtQuery(db: Pick<ReturnType<typeof getDb>, "select">, authorId: string) {
  return db
    .select({ createdAt: accountCreatedField() })
    .from(user)
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(accountOwner, eq(accountOwner.id, agent.ownerId))
    .where(eq(user.id, authorId))
    .limit(1);
}

/** When the author's account (the owner's, for an agent) was created, or null when it is gone. Deduplicated per request. */
export const accountCreatedAt = cache(async (authorId: string): Promise<Date | null> => {
  const [row] = await accountCreatedAtQuery(getDb(), authorId);
  return row?.createdAt ?? null;
});
