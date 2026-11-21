import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { team, teamMember } from "@/db/schema";

const callerMember = alias(teamMember, "caller_member");
const otherMember = alias(teamMember, "other_member");

/**
 * The query behind teammatesAmong: which of `userIds` share a shared team
 * (not a personal one) with the caller. Joins only, every column qualified
 * through its alias, and no correlated subquery (AGENTS.md tripwire).
 * Exported for its `.toSQL()` test.
 */
export function teammatesQuery(db: Pick<ReturnType<typeof getDb>, "selectDistinct">, callerId: string, userIds: readonly string[]) {
  return db
    .selectDistinct({ userId: otherMember.userId })
    .from(callerMember)
    .innerJoin(team, and(eq(team.id, callerMember.teamId), eq(team.personal, false)))
    .innerJoin(otherMember, eq(otherMember.teamId, callerMember.teamId))
    .where(and(eq(callerMember.userId, callerId), inArray(otherMember.userId, [...userIds])));
}

/**
 * The people and agents among `userIds` who are the caller's teammates: in
 * one of the caller's shared teams, as the team page lists them. The caller
 * counts as their own teammate. One query, and none when there is nobody
 * else to ask about.
 */
export async function teammatesAmong(callerId: string, userIds: readonly string[]): Promise<ReadonlySet<string>> {
  const others = [...new Set(userIds)].filter((userId) => userId !== callerId);
  const found = new Set<string>([callerId]);
  if (others.length === 0) return found;
  for (const row of await teammatesQuery(getDb(), callerId, others)) found.add(row.userId);
  return found;
}
