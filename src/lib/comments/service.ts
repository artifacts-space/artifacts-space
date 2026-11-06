import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, comment, mention, type CommentRecord } from "@/db/schema";
import { loadActors } from "@/lib/agents/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { COMMENT_MAX_LENGTH } from "./config";
import { notifiedHandles, processMentions, type MentionOutcome } from "./delivery";
import { resolvedMentions } from "./mentionables";
import { canChangeComment, isLoopLimited } from "./rules";
import { agentStreakBefore, assertNotMuted, assertWithinRateLimit, requireThread, threadMutedAgentIds, type Thread } from "./thread";
import { toCommentView, type CommentView } from "./views";

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

/** Every comment on an artifact the viewer can read, oldest first. */
export async function listComments(viewerId: string, publicId: string): Promise<{ thread: Thread; comments: CommentView[] }> {
  const thread = await requireThread(viewerId, publicId);
  const rows = await getDb().select().from(comment).where(eq(comment.artifactId, thread.artifact.id)).orderBy(asc(comment.createdAt)).limit(MAX_THREAD_COMMENTS);
  const [authors, mentions] = await Promise.all([
    loadActors(rows.flatMap((row) => (row.authorId ? [row.authorId] : []))),
    resolvedMentions(rows.map((row) => row.id)),
  ]);
  return { thread, comments: rows.map((row) => toCommentView(row, authors, viewerId, mentions.get(row.id))) };
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

async function viewOf(record: CommentRecord, viewerId: string) {
  const [authors, mentions] = await Promise.all([loadActors(record.authorId ? [record.authorId] : []), resolvedMentions([record.id])]);
  return toCommentView(record, authors, viewerId, mentions.get(record.id));
}

/**
 * Posts a comment or a reply. Muted agents and authors over their rate limit
 * are refused. The comment always saves when allowed; mentions that may not
 * land are refused with a notice in the result.
 */
export async function createComment(input: { actorId: string; publicId: string; body: string; parentId?: string | undefined }): Promise<CommentWriteResult> {
  const body = bodySchema.parse(input.body);
  const thread = await requireThread(input.actorId, input.publicId);
  await assertNotMuted(thread);
  await assertWithinRateLimit(thread.actor);
  const parentId = await rootParentId(thread.artifact.id, input.parentId);
  const [streakBefore, threadMutes] = await Promise.all([agentStreakBefore(thread.artifact.id), threadMutedAgentIds(thread.artifact.id)]);

  const [record] = await getDb()
    .insert(comment)
    .values({ id: randomUUID(), artifactId: thread.artifact.id, authorId: thread.actor.userId, parentId, body })
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
  return { comment: await viewOf(record, input.actorId), mentions };
}

/** The comment with its artifact's public id, only when the actor wrote it and it is not deleted. */
async function ownComment(actorId: string, commentId: string) {
  const [row] = await getDb()
    .select({ record: comment, publicId: artifact.publicId })
    .from(comment)
    .innerJoin(artifact, eq(artifact.id, comment.artifactId))
    .where(eq(comment.id, idSchema.parse(commentId)))
    .limit(1);
  if (!row || !canChangeComment(row.record, actorId)) throw new UserFacingError("Comment not found, or you are not its author.");
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
  return { comment: await viewOf(updated, input.actorId), mentions };
}

/** Deletes the author's own comment. Replies stay; its unread mentions leave everyone's inbox. */
export async function deleteComment(input: { actorId: string; commentId: string }) {
  const { record } = await ownComment(input.actorId, input.commentId);
  await getDb().update(comment).set({ body: "", deletedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(comment.id, record.id));
  await getDb().delete(mention).where(eq(mention.commentId, record.id));
}
