import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, comment, mention } from "@/db/schema";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { getArtifactAccess } from "@/lib/access";
import { canViewArtifact } from "@/lib/access-rules";
import { loadActors } from "@/lib/agents/queries";
import { listTeamIdsForUser } from "@/lib/teams/queries";

import { INBOX_CONTEXT_COMMENTS } from "./config";
import { toCommentView, type CommentView } from "./views";

/**
 * The inbox: mentions that landed for a person or an agent. Entries are
 * re-checked against the read rule when listed, so a mention on an artifact
 * that is no longer visible quietly drops out.
 */

/** One inbox entry. */
export interface InboxEntryView {
  id: string;
  createdAt: string;
  readAt: string | null;
  artifact: { publicId: string; title: string };
  comment: CommentView;
}

const INBOX_MAX = 50;

type VisibilityFields = Pick<ArtifactMetaRecord, "userId" | "visibility" | "teamId">;

function visibleTo(userId: string, teams: ReadonlySet<string>) {
  return (subject: VisibilityFields) => canViewArtifact(subject, { userId, isTeamMember: subject.teamId !== null && teams.has(subject.teamId) });
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
    return view ? [[publicId, view.served.title] as const] : [];
  }));
  const visible = rows.filter((row) => titles.has(row.artifact.publicId));
  const authors = await loadActors(visible.flatMap((row) => (row.record.authorId ? [row.record.authorId] : [])));
  return visible.map((row) => ({
    id: row.entry.id,
    createdAt: row.entry.createdAt.toISOString(),
    readAt: row.entry.readAt?.toISOString() ?? null,
    artifact: { publicId: row.artifact.publicId, title: titles.get(row.artifact.publicId) ?? "" },
    comment: toCommentView(row.record, authors, userId),
  }));
}

/** How many unread mentions a user can still see, up to the inbox limit. */
export async function countUnreadMentions(userId: string): Promise<number> {
  const [rows, teams] = await Promise.all([
    getDb()
      .select({ userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId })
      .from(mention)
      .innerJoin(comment, eq(comment.id, mention.commentId))
      .innerJoin(artifact, eq(artifact.id, mention.artifactId))
      .where(and(eq(mention.recipientId, userId), isNull(mention.readAt), isNull(comment.deletedAt)))
      .limit(INBOX_MAX),
    listTeamIdsForUser(userId),
  ]);
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
