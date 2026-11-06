import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, mention, teamMember, user } from "@/db/schema";
import { listTeamIdsForUser } from "@/lib/teams/queries";

import { mentionFacts } from "./delivery";
import type { Mentionable, MentionDirectory } from "./mention-autocomplete";
import type { ResolvedMention } from "./mentions";
import { mentionRefusal } from "./rules";
import { threadMutedAgentIds, type Thread } from "./thread";

/** Enough for any real team; keeps one huge team from bloating the thread. */
const MAX_MENTIONABLES = 500;

async function teammateIds(writerId: string) {
  const teamIds = [...(await listTeamIdsForUser(writerId))];
  if (teamIds.length === 0) return [];
  const rows = await getDb().select({ userId: teamMember.userId }).from(teamMember).where(inArray(teamMember.teamId, teamIds)).limit(MAX_MENTIONABLES);
  return rows.map((row) => row.userId);
}

async function namesById(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await getDb().select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * Everyone the thread's actor can mention on this artifact, for the composer's
 * suggestions: the artifact's author and the actor's teammates, kept only when
 * a mention would land under the same rule the server applies on post. The
 * actor is left out. Names come only for teammates. Sorted by handle.
 */
export async function listMentionables(thread: Thread): Promise<Mentionable[]> {
  const writerId = thread.actor.userId;
  const [teammates, threadMutes] = await Promise.all([teammateIds(writerId), threadMutedAgentIds(thread.artifact.id)]);
  const ids = [...new Set([thread.artifact.userId, ...teammates])].filter((id) => id !== writerId);
  const facts = await mentionFacts(ids, thread.artifact, writerId, threadMutes);
  const reachable = facts.filter((fact) => mentionRefusal(fact, false) === null);
  // Names only for teammates: a reader outside the author's teams sees the author's handle, never their name.
  const names = await namesById(reachable.flatMap((fact) => (fact.sharesTeamWithWriter && fact.userId ? [fact.userId] : [])));
  return reachable
    .flatMap((fact) => (fact.userId ? [{ userId: fact.userId, handle: fact.handle, name: names.get(fact.userId) ?? "", kind: fact.kind }] : []))
    .sort((a, b) => a.handle.localeCompare(b.handle));
}

/** The actor as a mentionable entry, for highlighting their own handle. Null without a handle. */
function selfMentionable(thread: Thread): Mentionable | null {
  const { actor } = thread;
  return actor.handle ? { userId: actor.userId, handle: actor.handle, name: actor.name, kind: actor.kind } : null;
}

/** What the composer needs to suggest and highlight mentions: reachable people and agents, and the actor. */
export async function mentionDirectory(thread: Thread): Promise<MentionDirectory> {
  return { candidates: await listMentionables(thread), self: selfMentionable(thread) };
}

/**
 * The mentions each comment delivered, by comment id. Only these handles are
 * highlighted, so unknown or refused @text stays plain.
 */
export async function resolvedMentions(commentIds: string[]): Promise<Map<string, ResolvedMention[]>> {
  const byComment = new Map<string, ResolvedMention[]>();
  if (commentIds.length === 0) return byComment;
  const rows = await getDb()
    .select({ commentId: mention.commentId, handle: user.username, agentId: agent.userId })
    .from(mention)
    .innerJoin(user, eq(user.id, mention.recipientId))
    .leftJoin(agent, eq(agent.userId, user.id))
    .where(inArray(mention.commentId, commentIds));
  for (const row of rows) {
    if (!row.handle) continue;
    const list = byComment.get(row.commentId) ?? [];
    list.push({ handle: row.handle, kind: row.agentId ? "agent" : "person" });
    byComment.set(row.commentId, list);
  }
  return byComment;
}
