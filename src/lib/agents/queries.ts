import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { agent, apiToken, teamMember, user } from "@/db/schema";

import { toActor, type Actor } from "./identity";

const owner = alias(user, "agent_owner");

function actorRows(userIds: string[]) {
  return getDb()
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      agentTeamId: agent.teamId,
      ownerId: agent.ownerId,
      ownerName: owner.name,
      mutedAt: agent.mutedAt,
      memberId: teamMember.id,
    })
    .from(user)
    .leftJoin(agent, eq(agent.userId, user.id))
    .leftJoin(owner, eq(owner.id, agent.ownerId))
    .leftJoin(teamMember, and(eq(teamMember.userId, user.id), eq(teamMember.teamId, agent.teamId)))
    .where(inArray(user.id, userIds));
}

/** Actors for these user ids, by id. Agents that left their team are missing. */
export async function loadActors(userIds: string[]): Promise<Map<string, Actor>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await actorRows(ids);
  const actors = new Map<string, Actor>();
  for (const row of rows) {
    const actor = toActor({ ...row, inAgentTeam: row.memberId !== null });
    if (actor) actors.set(actor.userId, actor);
  }
  return actors;
}

/** The actor for one user id, or null for an unknown user or an agent without its team. */
export async function loadActor(userId: string): Promise<Actor | null> {
  return (await loadActors([userId])).get(userId) ?? null;
}

/** True when the user is an agent. */
export async function isAgentUser(userId: string): Promise<boolean> {
  const [row] = await getDb().select({ userId: agent.userId }).from(agent).where(eq(agent.userId, userId)).limit(1);
  return Boolean(row);
}

/** One agent token, as the team page lists it. The secret is never stored. */
export interface AgentTokenView {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** An agent teammate, as the team page lists it. */
export interface TeamAgentView {
  userId: string;
  handle: string;
  name: string;
  ownerName: string | null;
  muted: boolean;
  createdAt: string;
  tokens: AgentTokenView[];
}

async function tokensByAgent(agentIds: string[]) {
  const byAgent = new Map<string, AgentTokenView[]>();
  if (agentIds.length === 0) return byAgent;
  const rows = await getDb()
    .select()
    .from(apiToken)
    .where(and(inArray(apiToken.userId, agentIds), isNull(apiToken.revokedAt)))
    .orderBy(asc(apiToken.createdAt));
  for (const row of rows) {
    const list = byAgent.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: row.lastUsedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() });
    byAgent.set(row.userId, list);
  }
  return byAgent;
}

/**
 * Agents in a team, oldest first. Tokens are included only when `withTokens`
 * is set (owners and admins). Callers must check the viewer's membership.
 */
export async function listTeamAgents(teamId: string, withTokens: boolean): Promise<TeamAgentView[]> {
  const rows = await getDb()
    .select({ userId: user.id, handle: user.username, name: user.name, ownerName: owner.name, mutedAt: agent.mutedAt, createdAt: agent.createdAt })
    .from(agent)
    .innerJoin(user, eq(user.id, agent.userId))
    .leftJoin(owner, eq(owner.id, agent.ownerId))
    .where(eq(agent.teamId, teamId))
    .orderBy(asc(agent.createdAt));
  const tokens = withTokens ? await tokensByAgent(rows.map((row) => row.userId)) : new Map<string, AgentTokenView[]>();
  return rows.map((row) => ({
    userId: row.userId,
    handle: row.handle ?? "",
    name: row.name,
    ownerName: row.ownerName,
    muted: row.mutedAt !== null,
    createdAt: row.createdAt.toISOString(),
    tokens: tokens.get(row.userId) ?? [],
  }));
}

/** The agent row for a user id, or null when the user is not an agent. */
export async function getAgentRecord(userId: string) {
  const [row] = await getDb().select().from(agent).where(eq(agent.userId, userId)).limit(1);
  return row ?? null;
}
