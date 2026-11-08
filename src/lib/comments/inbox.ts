import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, comment, mention } from "@/db/schema";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { getArtifactAccess } from "@/lib/access";
import { canViewArtifact } from "@/lib/access-rules";
import { loadActors } from "@/lib/agents/queries";
import { markMentionNotificationsRead } from "@/lib/notifications/feed";
import { listTeamIdsForUser } from "@/lib/teams/queries";

import { INBOX_CONTEXT_COMMENTS } from "./config";
import { canSeeComments } from "./setting-rules";
import { toCommentView, type CommentView } from "./views";

/**
 * The inbox: mentions that landed for a person or an agent. Entries are
 * re-checked against the read rule and the comments setting when listed, so
 * a mention on an artifact that is no longer visible, or whose comments are
 * hidden from the recipient, quietly drops out. Hidden entries stay stored and
 * come back unchanged if the comments come back; they never send anything.
 */

/** One inbox entry. */
export interface InboxEntryView {
  id: string;
  createdAt: string;
  readAt: string | null;
  artifact: { publicId: string; title: string; icon: string | null };
  comment: CommentView;
}

const INBOX_MAX = 50;

type VisibilityFields = Pick<ArtifactMetaRecord, "userId" | "visibility" | "teamId" | "comments">;

/** Whether the user can still read the artifact and see its comments, from their team ids. */
function visibleTo(userId: string, teams: ReadonlySet<string>) {
  return (subject: VisibilityFields) => {
    const isTeamMember = subject.teamId !== null && teams.has(subject.teamId);
    const canView = canViewArtifact(subject, { userId, isTeamMember });
    return canSeeComments(subject.comments, { canViewArtifact: canView, isAuthor: subject.userId === userId, isTeamMember });
  };
}

/**
 * The fields the unread count checks, for a user's unread mentions on live
 * comments. Joins only, with every column qualified (see subjectQuery in
 * src/lib/access.ts for why).
 */
export function unreadMentionSubjects(db: Pick<ReturnType<typeof getDb>, "select">, userId: string) {
  return db
    .select({ userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId, comments: artifact.comments })
    .from(mention)
    .innerJoin(comment, eq(comment.id, mention.commentId))
    .innerJoin(artifact, eq(artifact.id, mention.artifactId))
    .where(and(eq(mention.recipientId, userId), isNull(mention.readAt), isNull(comment.deletedAt)))
    .limit(INBOX_MAX);
}

function inboxRows(userId: string, unreadOnly: boolean, limit: number) {
  const conditions = [eq(mention.recipientId, userId), isNull(comment.deletedAt)];
  if (unreadOnly) conditions.push(isNull(mention.readAt));
  return getDb()
    .select({ entry: mention, record: comment, artifact })
    .from(mention)
    .innerJoin(comment, eq(comment.id, mention.commentId))
    .innerJoin(artifact, eq(artifact.id, mention.artifactId))
    .where(and(...conditions))
    .orderBy(desc(mention.createdAt))
    .limit(limit);
}

/** Inbox entries for a user, newest first. Unread only unless `unreadOnly` is false. */
export async function listInbox(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<InboxEntryView[]> {
  const limit = Math.min(Math.max(options.limit ?? INBOX_MAX, 1), INBOX_MAX);
  const rows = await inboxRows(userId, options.unreadOnly ?? true, limit);
  const publicIds = [...new Set(rows.map((row) => row.artifact.publicId))];
  const viewable = await Promise.all(publicIds.map((publicId) => getArtifactAccess(publicId, userId)));
  const titles = new Map(publicIds.flatMap((publicId, index) => {
    const view = viewable[index];
    if (!view) return [];
    const seesComments = canSeeComments(view.record.comments, { canViewArtifact: true, isAuthor: view.record.userId === userId, isTeamMember: view.isTeamMember });
    return seesComments ? [[publicId, { title: view.served.title, icon: view.served.icon }] as const] : [];
  }));
  const visible = rows.filter((row) => titles.has(row.artifact.publicId));
  const authors = await loadActors(visible.flatMap((row) => (row.record.authorId ? [row.record.authorId] : [])));
  return visible.map((row) => ({
    id: row.entry.id,
    createdAt: row.entry.createdAt.toISOString(),
    readAt: row.entry.readAt?.toISOString() ?? null,
    artifact: { publicId: row.artifact.publicId, title: "", icon: null, ...titles.get(row.artifact.publicId) },
    comment: toCommentView(row.record, authors, userId),
  }));
}

/** How many unread mentions a user can still see, up to the inbox limit. */
export async function countUnreadMentions(userId: string): Promise<number> {
  const [rows, teams] = await Promise.all([unreadMentionSubjects(getDb(), userId), listTeamIdsForUser(userId)]);
  return rows.filter(visibleTo(userId, teams)).length;
}

/** Marks some (or all) of the user's inbox entries read. Returns how many changed. */
export async function markInboxRead(userId: string, ids: string[] | "all"): Promise<number> {
  const conditions = [eq(mention.recipientId, userId), isNull(mention.readAt)];
  if (ids !== "all") {
    if (ids.length === 0) return 0;
    conditions.push(inArray(mention.id, ids));
  }
  const changed = await getDb().update(mention).set({ readAt: new Date() }).where(and(...conditions)).returning();
  // The bell's mention notifications for the same comments follow.
  await markMentionNotificationsRead(userId, changed.map((row) => row.commentId));
  return changed.length;
}

/** Marks every unread mention on one artifact read, for when the user opens its thread. */
export async function markArtifactMentionsRead(userId: string, artifactId: string) {
  await getDb()
    .update(mention)
    .set({ readAt: new Date() })
    .where(and(eq(mention.recipientId, userId), eq(mention.artifactId, artifactId), isNull(mention.readAt)));
}

/** The comments up to and including one comment, oldest first, for context. */
export async function threadContext(input: { artifactId: string; upTo: Date; viewerId: string; limit?: number }): Promise<CommentView[]> {
  const rows = await getDb()
    .select()
    .from(comment)
    .where(and(eq(comment.artifactId, input.artifactId), lte(comment.createdAt, input.upTo)))
    .orderBy(desc(comment.createdAt))
    .limit(input.limit ?? INBOX_CONTEXT_COMMENTS);
  const authors = await loadActors(rows.flatMap((row) => (row.authorId ? [row.authorId] : [])));
  return rows.reverse().map((row) => toCommentView(row, authors, input.viewerId));
}
