import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, teamMember, user } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { isUniqueViolation } from "@/lib/db-errors";
import { cleanHandleInput, validateHandle } from "@/lib/handles";
import { reconcileTeamArtifacts } from "@/lib/sharing/transfer";
import { getTeamMembershipById } from "@/lib/teams/queries";
import { isHandleAvailable } from "@/lib/teams/setup";
import { createApiToken, revokeApiToken } from "@/lib/tokens";
import { UserFacingError } from "@/lib/user-facing-error";

import { agentEmail } from "./identity";
import { getAgentRecord } from "./queries";
import { canManageAgents } from "./rules";

/**
 * Agent teammates. Owners and admins of a shared team add and remove agents,
 * mute them across the team, and create or revoke their tokens. Agents are
 * created straight in the database, never through Better Auth, so they get no
 * account, no session, and no personal team.
 */

export const AGENT_NAME_MAX_LENGTH = 80;

async function requireManager(actorId: string, teamId: string) {
  const membership = await getTeamMembershipById(actorId, teamId);
  if (!membership) throw new UserFacingError("Team not found.");
  if (membership.personal) throw new UserFacingError("Your personal team is only you. Create a team to add agents.");
  if (!canManageAgents(membership)) throw new UserFacingError("Only team owners and admins can manage agents.");
  return membership;
}

/** The agent and the actor's right to manage it. Unknown agents read as not found. */
async function requireManagedAgent(actorId: string, agentId: string) {
  const record = await getAgentRecord(agentId);
  if (!record) throw new UserFacingError("Agent not found.");
  const membership = await requireManager(actorId, record.teamId);
  return { record, membership };
}

function cleanAgentName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new UserFacingError("Give the agent a name.");
  if (trimmed.length > AGENT_NAME_MAX_LENGTH) throw new UserFacingError(`Use ${String(AGENT_NAME_MAX_LENGTH)} characters or fewer for the name.`);
  return trimmed;
}

async function cleanAgentHandle(handle: string) {
  const cleaned = cleanHandleInput(handle.startsWith("@") ? handle.slice(1) : handle);
  const problem = validateHandle(cleaned);
  if (problem) throw new UserFacingError(problem);
  if (!(await isHandleAvailable(cleaned))) throw new UserFacingError("That handle is taken. Try another one.");
  return cleaned;
}

async function insertAgentUser(id: string, handle: string, name: string) {
  try {
    await getDb().insert(user).values({ id, name, email: agentEmail(id), emailVerified: false, username: handle, usernameConfirmed: true });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("That handle was just taken. Try another one.");
    throw error;
  }
}

/**
 * Adds an agent to a shared team. Its handle shares the username namespace.
 * Returns the new agent's user id.
 */
export async function createAgent(input: { actorId: string; teamId: string; handle: string; name: string }): Promise<{ userId: string; handle: string }> {
  await requireManager(input.actorId, input.teamId);
  // Each agent gets its own rate limits, so adding agents is limited too.
  await enforceRateLimit("agentCreate", input.actorId);
  const name = cleanAgentName(input.name);
  const handle = await cleanAgentHandle(input.handle);
  const id = randomUUID();
  await insertAgentUser(id, handle, name);
  try {
    await getDb().insert(agent).values({ userId: id, teamId: input.teamId, ownerId: input.actorId });
    await getDb().insert(teamMember).values({ id: randomUUID(), teamId: input.teamId, userId: id, role: "member" });
  } catch (error) {
    // No transactions on the HTTP driver: undo the user row so no half-made agent is left.
    await getDb().delete(user).where(eq(user.id, id));
    throw error;
  }
  return { userId: id, handle };
}

/**
 * Removes an agent for good. Artifacts it shared with the team move to a team
 * owner first (as when a person leaves); then its user row goes, which
 * removes its tokens, inbox, and private artifacts. Its comments stay in
 * their threads without an author.
 */
export async function removeAgent(input: { actorId: string; agentId: string }) {
  const { record } = await requireManagedAgent(input.actorId, input.agentId);
  await getDb().delete(teamMember).where(and(eq(teamMember.teamId, record.teamId), eq(teamMember.userId, record.userId)));
  await reconcileTeamArtifacts(record.teamId);
  await getDb().delete(user).where(eq(user.id, record.userId));
}

/** Mutes or unmutes an agent across its team. Muted agents get no inbox entries and cannot comment. */
export async function setAgentTeamMute(input: { actorId: string; agentId: string; muted: boolean }) {
  const { record } = await requireManagedAgent(input.actorId, input.agentId);
  await getDb()
    .update(agent)
    .set(input.muted ? { mutedAt: new Date(), mutedBy: input.actorId } : { mutedAt: null, mutedBy: null })
    .where(eq(agent.userId, record.userId));
}

/** Creates a token for an agent. The secret is returned once; only its hash is stored. */
export async function createAgentToken(input: { actorId: string; agentId: string; name: string }) {
  const { record } = await requireManagedAgent(input.actorId, input.agentId);
  await enforceRateLimit("tokenCreate", input.actorId);
  return createApiToken(record.userId, input.name);
}

/** Revokes one of an agent's tokens. */
export async function revokeAgentToken(input: { actorId: string; agentId: string; tokenId: string }) {
  const { record } = await requireManagedAgent(input.actorId, input.agentId);
  await revokeApiToken(record.userId, input.tokenId);
}
