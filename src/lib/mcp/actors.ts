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
 * The list's `people` (listPeople) gives the rest, once per person.
 */
export function shortActor(actor: McpActor | null): McpActor | null {
  if (!actor) return null;
  return actor.handle ? { handle: actor.handle, kind: actor.kind } : actor;
}

/** One entry of a list's `people`: an actor without its handle, which is the key. */
export type McpPerson = Omit<McpActor, "handle">;

/**
 * Every person a list names by handle, once, in full: what each row would
 * carry if it named them in full. Built from the actors the rows show
 * (`shown`), never from the ids loaded, so the map names nobody a row
 * leaves out (a first author for a caller who may not edit). `actors` is
 * the same map the rows were built from, so a name is there exactly when
 * the caller would get it on artifacts_get.
 */
export function listPeople(shown: readonly (McpActor | null | undefined)[], actors: McpActors): Record<string, McpPerson> {
  const byHandle = new Map<string, McpActor>();
  for (const actor of actors.values()) if (actor.handle) byHandle.set(actor.handle, actor);
  const people: Record<string, McpPerson> = {};
  for (const actor of shown) {
    const full = actor?.handle ? byHandle.get(actor.handle) : undefined;
    if (!full?.handle || full.handle in people) continue;
    const { handle, ...person } = full;
    people[handle] = person;
  }
  return people;
}
