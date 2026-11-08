"use server";

import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { markArtifactMentionsRead } from "@/lib/comments/inbox";
import type { MentionDirectory } from "@/lib/comments/mention-autocomplete";
import { mentionDirectory } from "@/lib/comments/mentionables";
import { listThreadAgents, setThreadMute, type ThreadAgentView } from "@/lib/comments/mutes";
import { createComment, deleteComment, listComments, updateComment, type CommentWriteResult } from "@/lib/comments/service";
import { requireThread } from "@/lib/comments/thread";
import type { CommentView } from "@/lib/comments/views";
import { markArtifactNotificationsRead } from "@/lib/notifications/feed";
import { getSession } from "@/lib/session";

/**
 * Comment thread actions. They never redirect, because the thread component
 * also appears on pages signed-out readers can open; signed-out callers get a
 * plain error instead.
 */

const idSchema = z.string().trim().min(1).max(200);
const signInMessage = "Sign in to read and write comments.";

async function viewerId() {
  const session = await getSession();
  return session?.user.id ?? null;
}

/**
 * Reading a thread marks the viewer's mentions and comment notifications on
 * it read. A failure only leaves them unread; the thread still loads.
 */
async function markRead(userId: string, artifactId: string) {
  await Promise.all([markArtifactMentionsRead(userId, artifactId), markArtifactNotificationsRead(userId, artifactId)]).catch((error: unknown) => {
    console.error("[notifications] Marking a thread read failed", error instanceof Error ? error.name : "unknown error");
  });
}

/** A thread as the panel shows it. */
export interface ThreadData {
  comments: CommentView[];
  agents: ThreadAgentView[];
  viewerId: string;
}

/** The comments on an artifact, with the agents the viewer may mute there. */
export async function loadThreadAction(publicId: string): Promise<ActionResult<ThreadData>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const { thread, comments } = await listComments(userId, idSchema.parse(publicId));
    const authorIds = comments.flatMap((item) => (item.author?.kind === "agent" ? [item.author.userId] : []));
    const [agents] = await Promise.all([listThreadAgents(thread, authorIds), markRead(userId, thread.artifact.id)]);
    return { success: true, data: { comments, agents, viewerId: userId } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The comments could not be loaded. Please try again.") };
  }
}

/**
 * The people and agents the viewer can mention on this artifact, and the
 * viewer's own handle, for the composer's suggestions and highlighting.
 * Loaded once per thread, never per keystroke.
 */
export async function loadMentionablesAction(publicId: string): Promise<ActionResult<MentionDirectory>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const thread = await requireThread(userId, idSchema.parse(publicId));
    return { success: true, data: await mentionDirectory(thread) };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Suggestions could not be loaded.") };
  }
}

/** Posts a comment or a reply. Refused mentions come back in the result. */
export async function createCommentAction(publicId: string, body: string, parentId: string | null): Promise<ActionResult<CommentWriteResult>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const result = await createComment({ actorId: userId, publicId: idSchema.parse(publicId), body: z.string().parse(body), parentId: parentId ?? undefined });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The comment could not be posted. Please try again.") };
  }
}

/** Edits the viewer's own comment. */
export async function updateCommentAction(commentId: string, body: string): Promise<ActionResult<CommentWriteResult>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    return { success: true, data: await updateComment({ actorId: userId, commentId: idSchema.parse(commentId), body: z.string().parse(body) }) };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The comment could not be saved. Please try again.") };
  }
}

/** Deletes the viewer's own comment. */
export async function deleteCommentAction(commentId: string): Promise<ActionResult<null>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    await deleteComment({ actorId: userId, commentId: idSchema.parse(commentId) });
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The comment could not be deleted. Please try again.") };
  }
}

/** Mutes or unmutes an agent in this artifact's thread. */
export async function setThreadMuteAction(publicId: string, agentHandle: string, muted: boolean): Promise<ActionResult<null>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    await setThreadMute({ actorId: userId, publicId: idSchema.parse(publicId), agentHandle: idSchema.parse(agentHandle), muted: z.boolean().parse(muted) });
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The mute could not be changed. Please try again.") };
  }
}

/** Marks the viewer's unread mentions and comment notifications on this artifact read, when they open its thread. */
export async function markThreadReadAction(publicId: string): Promise<ActionResult<null>> {
  try {
    const userId = await viewerId();
    if (!userId) return { success: false, error: signInMessage };
    const thread = await requireThread(userId, idSchema.parse(publicId));
    await markRead(userId, thread.artifact.id);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The mentions could not be marked read.") };
  }
}
