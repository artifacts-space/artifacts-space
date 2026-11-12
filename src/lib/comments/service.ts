import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, comment, mention, type CommentRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { loadActors } from "@/lib/agents/queries";
import { notifyComment } from "@/lib/notifications/create";
import { UserFacingError } from "@/lib/user-facing-error";

import { anchorToStore, assertTopLevelAnchor } from "./anchor-input";
import type { CommentAnchor } from "./anchor-rules";
import { COMMENT_MAX_LENGTH, RESOLVE_RATE_LIMITS } from "./config";
import { notifiedHandles, processMentions, type MentionOutcome } from "./delivery";
import { resolvedMentions } from "./mentionables";
import { canChangeComment, isLoopLimited, resolveRefusal } from "./rules";
import { anchorGateFor } from "./served-anchors";
import { agentStreakBefore, assertNotMuted, assertWithinRateLimit, requireThread, threadMutedAgentIds, type Thread } from "./thread";
import { actorIdsOf, toCommentView, type CommentView, type CommentViewContext } from "./views";

/**
 * Comment threads on artifacts. Everyone who can view an artifact (and is
 * signed in) can read and write its comments; only a comment's author edits
 * or deletes it. Agents act through their tokens with the same rules, plus
 * mutes, the loop limit, and stricter rate limits.
 */

const bodySchema = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(COMMENT_MAX_LENGTH, `Keep comments under ${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`);
const idSchema = z.string().trim().min(1).max(200);

/** A saved comment and what happened to its mentions. */
export interface CommentWriteResult {
  comment: CommentView;
  mentions: MentionOutcome;
}

const MAX_THREAD_COMMENTS = 500;

/**
 * What the thread's actor may see of comments: their kind (for resolving)
 * and the anchors whose words are in the version they are served.
 */
async function viewContext(thread: Thread, records: readonly CommentRecord[]): Promise<CommentViewContext> {
  const anchorFor = await anchorGateFor({ publicId: thread.artifact.publicId, viewerId: thread.actor.userId, records, source: thread.version.source });
  return { viewerKind: thread.actor.kind, anchorFor };
}

/** Every comment on an artifact the viewer can read, oldest first. */
export async function listComments(viewerId: string, publicId: string): Promise<{ thread: Thread; comments: CommentView[] }> {
  const thread = await requireThread(viewerId, publicId);
  const rows = await getDb().select().from(comment).where(eq(comment.artifactId, thread.artifact.id)).orderBy(asc(comment.createdAt)).limit(MAX_THREAD_COMMENTS);
  const [authors, mentions, context] = await Promise.all([loadActors(actorIdsOf(rows)), resolvedMentions(rows.map((row) => row.id)), viewContext(thread, rows)]);
  return { thread, comments: rows.map((row) => toCommentView(row, authors, viewerId, mentions.get(row.id), context)) };
}

/** Replies always attach to the top-level comment, so threads stay one level deep. */
async function rootParentId(artifactId: string, parentId: string | undefined) {
  if (!parentId) return null;
  const [parent] = await getDb()
    .select({ id: comment.id, parentId: comment.parentId })
    .from(comment)
    .where(and(eq(comment.id, idSchema.parse(parentId)), eq(comment.artifactId, artifactId)))
    .limit(1);
  if (!parent) throw new UserFacingError("The comment you are replying to was not found.");
  return parent.parentId ?? parent.id;
}

/** One comment as the thread's actor sees it, through the same anchor rule as the list. */
async function viewOf(record: CommentRecord, thread: Thread) {
  const [authors, mentions, context] = await Promise.all([loadActors(actorIdsOf([record])), resolvedMentions([record.id]), viewContext(thread, [record])]);
  return toCommentView(record, authors, thread.actor.userId, mentions.get(record.id), context);
}

/**
 * Posts a comment or a reply. Muted agents and authors over their rate limit
 * are refused. The comment always saves when allowed; mentions that may not
 * land are refused with a notice in the result. A top-level comment can be
 * made on words in the artifact: `anchor` from a person's selection (not
 * checked against the saved content, which may lag the editor), or `quote`
 * from an agent, which must be in the content the agent is served.
 */
export async function createComment(input: {
  actorId: string;
  publicId: string;
  body: string;
  parentId?: string | undefined;
  anchor?: CommentAnchor | undefined;
  quote?: string | undefined;
}): Promise<CommentWriteResult> {
  const body = bodySchema.parse(input.body);
  assertTopLevelAnchor(input);
  const thread = await requireThread(input.actorId, input.publicId);
  await assertNotMuted(thread);
  const anchor = await anchorToStore(thread, input);
  await assertWithinRateLimit(thread.actor);
  const parentId = await rootParentId(thread.artifact.id, input.parentId);
  const [streakBefore, threadMutes] = await Promise.all([agentStreakBefore(thread.artifact.id), threadMutedAgentIds(thread.artifact.id)]);

  const [record] = await getDb()
    .insert(comment)
    .values({ id: randomUUID(), artifactId: thread.artifact.id, authorId: thread.actor.userId, parentId, body, quote: anchor?.quote ?? null, quotePrefix: anchor?.prefix ?? null, quoteSuffix: anchor?.suffix ?? null })
    .returning();
  if (!record) throw new Error("The comment could not be saved.");

  const mentions = await processMentions({
    body,
    artifact: thread.artifact,
    commentId: record.id,
    writer: thread.actor,
    loopLimited: isLoopLimited({ writerKind: thread.actor.kind, streakBefore }),
    threadMutes,
  });
  notifyComment({ artifact: thread.artifact, commentId: record.id, parentId, writer: thread.actor, writerThreadMuted: threadMutes.has(thread.actor.userId) });
  return { comment: await viewOf(record, thread), mentions };
}

/** A comment and its artifact's public id, by comment id, or null; the caller checks access. */
async function commentWithArtifact(commentId: string) {
  const [row] = await getDb()
    .select({ record: comment, publicId: artifact.publicId })
    .from(comment)
    .innerJoin(artifact, eq(artifact.id, comment.artifactId))
    .where(eq(comment.id, idSchema.parse(commentId)))
    .limit(1);
  return row ?? null;
}

/** The comment with its artifact's public id, only when the actor wrote it and it is not deleted. */
async function ownComment(actorId: string, commentId: string) {
  const row = await commentWithArtifact(commentId);
  if (!row || !canChangeComment(row.record, actorId)) throw new UserFacingError("Comment not found, already deleted, or written by someone else. You can only change your own comments.");
  // The author must still be able to view the artifact.
  const thread = await requireThread(actorId, row.publicId);
  return { record: row.record, thread };
}

/** Changes the author's own comment. New mentions in the edit are notified once; earlier ones are not repeated. */
export async function updateComment(input: { actorId: string; commentId: string; body: string }): Promise<CommentWriteResult> {
  const body = bodySchema.parse(input.body);
  const { record, thread } = await ownComment(input.actorId, input.commentId);
  await assertNotMuted(thread);
  const [updated] = await getDb().update(comment).set({ body, updatedAt: sql`now()` }).where(eq(comment.id, record.id)).returning();
  if (!updated) throw new UserFacingError("Comment not found.");

  const [streakBefore, threadMutes, skipHandles] = await Promise.all([
    agentStreakBefore(thread.artifact.id, record.createdAt),
    threadMutedAgentIds(thread.artifact.id),
    notifiedHandles(record.id),
  ]);
  const mentions = await processMentions({
    body,
    artifact: thread.artifact,
    commentId: record.id,
    writer: thread.actor,
    loopLimited: isLoopLimited({ writerKind: thread.actor.kind, streakBefore }),
    threadMutes,
    skipHandles,
  });
  if (mentions.notified.length > 0) {
    notifyComment({ artifact: thread.artifact, commentId: record.id, parentId: record.parentId, writer: thread.actor, writerThreadMuted: threadMutes.has(thread.actor.userId), edited: true });
  }
  return { comment: await viewOf(updated, thread), mentions };
}

/**
 * Deletes the author's own comment. Replies stay; its unread mentions leave
 * everyone's inbox, and the words it was made on (a copy of artifact content)
 * go with its body.
 */
export async function deleteComment(input: { actorId: string; commentId: string }) {
  const { record } = await ownComment(input.actorId, input.commentId);
  await getDb().update(comment).set({ body: "", quote: null, quotePrefix: null, quoteSuffix: null, deletedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(comment.id, record.id));
  await getDb().delete(mention).where(eq(mention.commentId, record.id));
}

/**
 * Resolves a thread by its top-level comment, or reopens it. Only a person
 * who may use the thread does this (resolveRefusal). Idempotent: resolving a
 * resolved thread keeps who resolved it and when, and reopening an open one
 * changes nothing. Nobody is notified, and `updated_at` (the "edited" label)
 * is left alone.
 */
export async function resolveComment(input: { actorId: string; commentId: string; resolved: boolean }): Promise<CommentView> {
  const resolved = z.boolean().parse(input.resolved);
  const row = await commentWithArtifact(input.commentId);
  if (!row) throw new UserFacingError("Comment not found.");
  const thread = await requireThread(input.actorId, row.publicId);
  const refusal = resolveRefusal({ viewerKind: thread.actor.kind, canUseThread: true, comment: row.record });
  if (refusal) throw new UserFacingError(refusal);
  for (const name of RESOLVE_RATE_LIMITS) await enforceRateLimit(name, thread.actor.userId);
  const live = and(eq(comment.id, row.record.id), isNull(comment.parentId), isNull(comment.deletedAt));
  if (resolved) {
    await getDb().update(comment).set({ resolvedAt: sql`now()`, resolvedBy: thread.actor.userId }).where(and(live, isNull(comment.resolvedAt)));
  } else {
    await getDb().update(comment).set({ resolvedAt: null, resolvedBy: null }).where(live);
  }
  const [record] = await getDb().select().from(comment).where(eq(comment.id, row.record.id)).limit(1);
  if (!record) throw new UserFacingError("Comment not found.");
  return viewOf(record, thread);
}
