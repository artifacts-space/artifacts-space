import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, comment, threadMute } from "@/db/schema";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getArtifactAccess } from "@/lib/access";
import type { Actor } from "@/lib/agents/identity";
import { loadActor } from "@/lib/agents/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { AGENT_LOOP_LIMIT, COMMENT_RATE_LIMITS } from "./config";
import { agentStreak, canUseComments, isAgentMuted, type AuthorKind } from "./rules";
import { hiddenCommentsMessage } from "./setting-rules";

/**
 * Thread facts the comment service needs: the access check, mutes, the agent
 * streak, and rate-limit counts. A thread is every comment on one artifact.
 */

/** An artifact's thread for an actor who may use it. */
export interface Thread {
  actor: Actor;
  /** The stored row, for ids and access fields. Never show its content or title. */
  artifact: ArtifactMetaRecord;
  /** The title this actor may read (the approved one for readers outside the team). */
  title: string;
}

/**
 * Loads the actor and the artifact through the one access check. Signed-out
 * viewers, unknown artifacts, and artifacts the actor cannot view all read as
 * "not found". A viewer who can read the artifact but not its comments (the
 * comments setting) is told so, and gets nothing from the thread.
 */
export async function requireThread(actorId: string, publicId: string): Promise<Thread> {
  const [actor, viewable] = await Promise.all([loadActor(actorId), getArtifactAccess(publicId, actorId)]);
  if (!actor || !viewable) throw new UserFacingError("Artifact not found.");
  const { record } = viewable;
  const allowed = canUseComments({ signedIn: true, setting: record.comments, canViewArtifact: true, isAuthor: record.userId === actorId, isTeamMember: viewable.isTeamMember });
  if (!allowed) throw new UserFacingError(hiddenCommentsMessage(record.comments));
  return { actor, artifact: record, title: viewable.served.title };
}

/** Agent ids muted in this artifact's thread. */
export async function threadMutedAgentIds(artifactId: string): Promise<Set<string>> {
  const rows = await getDb().select({ agentId: threadMute.agentId }).from(threadMute).where(eq(threadMute.artifactId, artifactId));
  return new Set(rows.map((row) => row.agentId));
}

/** Refuses a post from an agent muted by its team or in this thread. */
export async function assertNotMuted(thread: Thread) {
  if (thread.actor.kind !== "agent") return;
  if (thread.actor.teamMuted) throw new UserFacingError("Your team muted you, so you cannot post comments. Ask a team owner or admin to unmute you.");
  const threadMuted = (await threadMutedAgentIds(thread.artifact.id)).has(thread.actor.userId);
  if (isAgentMuted({ teamMuted: false, threadMuted })) {
    throw new UserFacingError("You are muted in this thread, so you cannot post here.");
  }
}

/** Refuses a post when the author used up a rate window (the shared Postgres rate limiter). */
export async function assertWithinRateLimit(actor: Actor) {
  for (const name of COMMENT_RATE_LIMITS[actor.kind]) {
    await enforceRateLimit(name, actor.userId);
  }
}

/**
 * How many agent comments end the thread, looking only at comments before
 * `before` when given. Comments whose author is gone count as agent comments,
 * so removing an agent never resets the loop limit.
 */
export async function agentStreakBefore(artifactId: string, before?: Date): Promise<number> {
  const conditions = [eq(comment.artifactId, artifactId)];
  if (before) conditions.push(lt(comment.createdAt, before));
  const rows = await getDb()
    .select({ authorId: comment.authorId, agentId: agent.userId })
    .from(comment)
    .leftJoin(agent, eq(agent.userId, comment.authorId))
    .where(and(...conditions))
    .orderBy(desc(comment.createdAt))
    .limit(AGENT_LOOP_LIMIT + 1);
  const kinds: AuthorKind[] = rows.map((row) => (row.authorId && !row.agentId ? "person" : "agent"));
  return agentStreak(kinds);
}

/** Comment rows by id within one artifact. */
export async function commentsByIds(artifactId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return getDb().select().from(comment).where(and(eq(comment.artifactId, artifactId), inArray(comment.id, ids)));
}
