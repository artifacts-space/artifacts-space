import type { Actor } from "@/lib/agents/identity";
import { loadActors } from "@/lib/agents/queries";
import { teammatesAmong } from "@/lib/teams/teammates";

/**
 * A person or agent as every MCP result names them (an author, a saver, a
 * resolver, an approver, a teammate): what the web app's label shows anyone
 * ("@ada", "@claude-code for Charles", a name when there is no handle), and
 * the name only to those who see it on the team page. A handle is letters,
 * digits, and hyphens; a name is text its owner typed, so it is labelled
 * untrusted, as comment bodies are.
 */
export interface McpActor {
  handle: string | null;
  kind: "person" | "agent";
  /** Shown when there is no handle (the label shows the name then), and to the caller's teammates. Left out otherwise. */
  name?: { untrustedText: string };
  /** For an agent: the person who added it, as its label shows ("for Charles"). Left out for people. */
  for?: { untrustedText: string };
}

/** What an actor carries for its MCP shape: as loadActors and the comment views have it. */
export interface ActorFacts {
  handle: string | null;
  kind: "person" | "agent";
  name: string;
  ownerName: string | null;
}

/** The facts of a loaded actor. */
export function actorFacts(actor: Actor): ActorFacts {
  return { handle: actor.handle, kind: actor.kind, name: actor.name, ownerName: actor.kind === "agent" ? actor.ownerName : null };
}

/** An actor for an agent. `isTeammate` says whether the caller shares a team with them (teammatesAmong). */
export function toMcpActor(facts: ActorFacts, isTeammate: boolean): McpActor {
  const showsName = isTeammate || !facts.handle;
  return {
    handle: facts.handle,
    kind: facts.kind,
    ...(showsName && facts.name ? { name: { untrustedText: facts.name } } : {}),
    ...(facts.kind === "agent" && facts.ownerName ? { for: { untrustedText: facts.ownerName } } : {}),
  };
}

/** Looks up MCP actors by user id: one per id that is still an actor. */
export type McpActors = ReadonlyMap<string, McpActor>;

/**
 * The actors for these user ids as the caller may see them, in two queries
 * that run together: the actors, and which of them are the caller's
 * teammates. Ids of people and agents who are gone are missing.
 */
export async function loadMcpActors(callerId: string, userIds: readonly (string | null | undefined)[]): Promise<McpActors> {
  const ids = [...new Set(userIds.filter((userId): userId is string => typeof userId === "string" && userId !== ""))];
  if (ids.length === 0) return new Map();
  const [actors, teammates] = await Promise.all([loadActors(ids), teammatesAmong(callerId, ids)]);
  return new Map([...actors].map(([userId, actor]) => [userId, toMcpActor(actorFacts(actor), teammates.has(userId))]));
}

/** One actor from the map, or null when the id is unset or they are gone. */
export function actorOf(actors: McpActors, userId: string | null | undefined): McpActor | null {
  return userId ? actors.get(userId) ?? null : null;
}

/**
 * The short form for a list, where the same people come back on many rows:
 * handle and kind, with the name only when there is no handle to go by.
 * artifacts_get and teams_list give the rest.
 */
export function shortActor(actor: McpActor | null): McpActor | null {
  if (!actor) return null;
  return actor.handle ? { handle: actor.handle, kind: actor.kind } : actor;
}
