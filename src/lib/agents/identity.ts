/**
 * Who is acting: a person, or an agent teammate. Agents are `user` rows with
 * an `agent` row beside them. They have a reserved email on the unroutable
 * `.invalid` top-level domain and no sign-in method, so they act only through
 * their own API tokens.
 */

/** Every agent's email ends in this domain. `.invalid` can never receive mail (RFC 2606). */
export const AGENT_EMAIL_DOMAIN = "agents.artifacts.invalid";

/** The reserved, unroutable email for an agent's user row. */
export function agentEmail(userId: string): string {
  return `agent-${userId}@${AGENT_EMAIL_DOMAIN}`;
}

/** True for an agent's reserved email. Sign-in and sign-up refuse these. */
export function isAgentEmail(email: unknown): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${AGENT_EMAIL_DOMAIN}`);
}

/** A person acting in the web app or through their personal token. */
export interface PersonActor {
  kind: "person";
  userId: string;
  handle: string | null;
  name: string;
}

/** An agent teammate acting through its own token. */
export interface AgentActor {
  kind: "agent";
  userId: string;
  handle: string;
  name: string;
  teamId: string;
  ownerId: string | null;
  ownerName: string | null;
  teamMuted: boolean;
}

export type Actor = PersonActor | AgentActor;

/** The joined row an actor is built from. `agentTeamId` is null for people. */
export interface ActorRow {
  userId: string;
  name: string;
  username: string | null;
  agentTeamId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  mutedAt: Date | null;
  /** Whether the user is still a member of `agentTeamId`. */
  inAgentTeam: boolean;
}

/**
 * Builds the actor from its row. An agent that has lost its team membership
 * (or its handle) is not an actor at all, so its tokens stop working.
 */
export function toActor(row: ActorRow): Actor | null {
  if (!row.agentTeamId) return { kind: "person", userId: row.userId, handle: row.username, name: row.name };
  if (!row.inAgentTeam || !row.username) return null;
  return {
    kind: "agent",
    userId: row.userId,
    handle: row.username,
    name: row.name,
    teamId: row.agentTeamId,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    teamMuted: row.mutedAt !== null,
  };
}

/** True when a token's user may act: people always, agents only while they belong to their team. */
export function tokenUserIsActive(row: { agentTeamId: string | null; agentMemberId: string | null }): boolean {
  return row.agentTeamId === null || row.agentMemberId !== null;
}

/** How work is credited: "@claude-code for Charles", or the person's handle or name. */
export function attribution(actor: { kind: "person" | "agent"; handle: string | null; name: string; ownerName?: string | null }): string {
  const who = actor.handle ? `@${actor.handle}` : actor.name || "a user";
  if (actor.kind === "agent" && actor.ownerName) return `${who} for ${actor.ownerName}`;
  return who;
}
