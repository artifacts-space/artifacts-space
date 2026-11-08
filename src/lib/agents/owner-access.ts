import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { agent, artifact, teamMember } from "@/db/schema";

/**
 * The person who added an agent acts for it on the artifacts it writes: they
 * read, list, edit, and share them as the author would (src/lib/access-rules.ts).
 * Only while they are still a member of the agent's team: someone who left
 * the team loses this, as they lose the team's artifacts. Nobody else gains
 * anything: not teammates, not the owner of another agent, and not the
 * owner's other agents (an agent's viewer id is never an agent's owner id).
 */

type Db = Pick<ReturnType<typeof getDb>, "select">;

/**
 * The agents `viewerId` acts for: agents they own, in a team they still
 * belong to. Joins only, every column qualified, and not correlated with any
 * outer query, so it is safe as an `in (...)` subquery (see the tripwire in
 * AGENTS.md). team_member is unique on (team_id, user_id), so the join adds
 * at most one row per agent.
 */
export function ownedAgentIdsQuery(db: Db, viewerId: string, onlyAgentId?: string) {
  const owned = eq(agent.ownerId, viewerId);
  return db
    .select({ id: agent.userId })
    .from(agent)
    .innerJoin(teamMember, and(eq(teamMember.teamId, agent.teamId), eq(teamMember.userId, viewerId)))
    .where(onlyAgentId === undefined ? owned : and(owned, eq(agent.userId, onlyAgentId)));
}

/** The ids of the agents `viewerId` acts for. Deduplicated per request. */
export const ownedAgentIds = cache(async (viewerId: string): Promise<ReadonlySet<string>> => {
  const rows = await ownedAgentIdsQuery(getDb(), viewerId);
  return new Set(rows.map((row) => row.id));
});

/** Whether `viewerId` acts for `authorId`: the author is an agent they own, in a team they still belong to. */
export async function actsForAuthor(viewerId: string | null, authorId: string): Promise<boolean> {
  if (!viewerId || viewerId === authorId) return false;
  const [row] = await ownedAgentIdsQuery(getDb(), viewerId, authorId).limit(1);
  return Boolean(row);
}

/**
 * SQL for the "mine" list: artifacts the viewer wrote, and those written by
 * agents they act for. The subquery is not correlated (see ownedAgentIdsQuery).
 */
export function authoredByViewerCondition(db: Db, viewerId: string): SQL {
  const condition = or(eq(artifact.userId, viewerId), inArray(artifact.userId, ownedAgentIdsQuery(db, viewerId)));
  if (!condition) throw new Error("The author scope could not be built.");
  return condition;
}
