import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { teamRole, teamRoleAssignment } from "@/db/roles-schema";
import { agent, teamMember, user } from "@/db/schema";

import { groupTeamHandles, MAX_TEAM_HANDLES, type TeamHandleRow, type TeamHandles } from "./handle-rules";

const assignedRole = alias(teamRole, "assigned_role");
const agentOwner = alias(user, "agent_owner");

/**
 * The query behind teamHandles for one team: its members with their handle,
 * name, whether they are an agent (and then who added it and whether it is
 * muted), their stored and custom role in this team, and when they joined,
 * at most `limit`. Joins only, no correlated subquery (AGENTS.md tripwire);
 * no email. Exported for its `.toSQL()` test.
 */
export function teamHandlesQuery(db: Pick<ReturnType<typeof getDb>, "select">, teamId: string, limit: number) {
  return db
    .select({
      teamId: teamMember.teamId,
      userId: teamMember.userId,
      handle: user.username,
      name: user.name,
      agentId: agent.userId,
      ownerName: agentOwner.name,
      mutedAt: agent.mutedAt,
      role: teamMember.role,
      customKey: assignedRole.key,
      customName: assignedRole.name,
      joinedAt: teamMember.createdAt,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .leftJoin(agentOwner, eq(agentOwner.id, agent.ownerId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
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
  const rows: TeamHandleRow[] = perTeam.flat().map(({ agentId, mutedAt, ownerName, ...row }) => {
    const isAgent = agentId !== null;
    return { ...row, isAgent, ...(isAgent ? { ownerName, muted: mutedAt !== null } : {}) };
  });
  return groupTeamHandles(rows, { callerId, teamIds });
}
