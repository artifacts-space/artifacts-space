import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, comment, mention } from "@/db/schema";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { getArtifactAccess, type ArtifactAccess } from "@/lib/access";
import { canViewArtifact } from "@/lib/access-rules";
import { loadActors } from "@/lib/agents/queries";
import { markMentionNotificationsRead } from "@/lib/notifications/feed";
import { listTeamIdsForUser } from "@/lib/teams/queries";

import type { AnchorGate } from "./anchor-privacy-rules";
import { INBOX_CONTEXT_COMMENTS } from "./config";
import { anchorGateFor } from "./served-anchors";
import { canSeeComments } from "./setting-rules";
import { actorIdsOf, toCommentView, type CommentView } from "./views";

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

/** The served title and icon, and the version, of each artifact whose comments the user can still see. */
async function visibleArtifacts(userId: string, publicIds: readonly string[]) {
  const viewable = await Promise.all(publicIds.map((publicId) => getArtifactAccess(publicId, userId)));
  const visible = new Map<string, { title: string; icon: string | null; source: ArtifactAccess["version"]["source"] }>();
  publicIds.forEach((publicId, index) => {
    const view = viewable[index];
    if (!view) return;
    const seesComments = canSeeComments(view.record.comments, { canViewArtifact: true, isAuthor: view.record.userId === userId, isTeamMember: view.isTeamMember });
    if (seesComments) visible.set(publicId, { title: view.served.title, icon: view.served.icon, source: view.version.source });
  });
  return visible;
}

/** Inbox entries for a user, newest first. Unread only unless `unreadOnly` is false. */
export async function listInbox(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<InboxEntryView[]> {
  const limit = Math.min(Math.max(options.limit ?? INBOX_MAX, 1), INBOX_MAX);
  const rows = await inboxRows(userId, options.unreadOnly ?? true, limit);
  const artifacts = await visibleArtifacts(userId, [...new Set(rows.map((row) => row.artifact.publicId))]);
  const visible = rows.filter((row) => artifacts.has(row.artifact.publicId));
  // One anchor gate per artifact, each through the version this user is served there.
  const gated = [...artifacts].map(([publicId, served]) =>
    anchorGateFor({ publicId, viewerId: userId, records: visible.filter((row) => row.artifact.publicId === publicId).map((row) => row.record), source: served.source }).then((gate) => [publicId, gate] as const),
  );
  const [actors, gates] = await Promise.all([loadActors([userId, ...actorIdsOf(visible.map((row) => row.record))]), Promise.all(gated)]);
  const anchorGates = new Map<string, AnchorGate>(gates);
  const viewerKind = actors.get(userId)?.kind ?? null;
  return visible.flatMap((row) => {
    const served = artifacts.get(row.artifact.publicId);
    const anchorFor = anchorGates.get(row.artifact.publicId);
    if (!served || !anchorFor) return [];
    return [{
      id: row.entry.id,
      createdAt: row.entry.createdAt.toISOString(),
      readAt: row.entry.readAt?.toISOString() ?? null,
      artifact: { publicId: row.artifact.publicId, title: served.title, icon: served.icon },
      comment: toCommentView(row.record, actors, userId, [], { viewerKind, anchorFor }),
    }];
  });
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

/**
 * The comments up to and including one comment, oldest first, for context.
 * The caller checked that the viewer may read this artifact's comments;
 * quotes still follow the version the viewer is served.
 */
export async function threadContext(input: { artifactId: string; publicId: string; upTo: Date; viewerId: string; limit?: number }): Promise<CommentView[]> {
  const rows = await getDb()
    .select()
    .from(comment)
    .where(and(eq(comment.artifactId, input.artifactId), lte(comment.createdAt, input.upTo)))
    .orderBy(desc(comment.createdAt))
    .limit(input.limit ?? INBOX_CONTEXT_COMMENTS);
  const [actors, anchorFor] = await Promise.all([loadActors([input.viewerId, ...actorIdsOf(rows)]), anchorGateFor({ publicId: input.publicId, viewerId: input.viewerId, records: rows })]);
  const context = { viewerKind: actors.get(input.viewerId)?.kind ?? null, anchorFor };
  return rows.reverse().map((row) => toCommentView(row, actors, input.viewerId, [], context));
}
