import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, teamMember, user } from "@/db/schema";

import { groupTeamHandles, MAX_TEAM_HANDLES, type TeamHandleRow, type TeamHandles } from "./handle-rules";

/**
 * The query behind teamHandles for one team: its members with their handle,
 * name, and whether they are an agent, at most `limit`. Joins only, no
 * correlated subquery (AGENTS.md tripwire). Exported for its `.toSQL()` test.
 */
export function teamHandlesQuery(db: Pick<ReturnType<typeof getDb>, "select">, teamId: string, limit: number) {
  return db
    .select({ teamId: teamMember.teamId, userId: teamMember.userId, handle: user.username, name: user.name, agentId: agent.userId })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .where(eq(teamMember.teamId, teamId))
    .orderBy(asc(user.username))
    .limit(limit);
}

/**
 * The teammates the caller can @mention, by team: people and agents in each
 * team of `teamIds`, without the caller. Callers pass only teams the caller
 * belongs to (from listTeamsForUser), so nobody learns the members of a team
 * they are not in. One query per team, so a large team never crowds out the
 * others; each reads two rows past the cap (the caller may be one of them)
 * to know whether the list was cut.
 */
export async function teamHandles(callerId: string, teamIds: string[]): Promise<Map<string, TeamHandles>> {
  if (teamIds.length === 0) return new Map();
  const perTeam = await Promise.all(teamIds.map((teamId) => teamHandlesQuery(getDb(), teamId, MAX_TEAM_HANDLES + 2)));
  const rows: TeamHandleRow[] = perTeam.flat().map(({ agentId, ...row }) => ({ ...row, isAgent: agentId !== null }));
  return groupTeamHandles(rows, { callerId, teamIds });
}
