import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { notification } from "@/db/notification-schema";
import { artifact, comment, mention, sharingRequest, team } from "@/db/schema";
import { getArtifactAccess } from "@/lib/access";
import type { SharingRequestKind } from "@/lib/artifact-types";
import { loadActors } from "@/lib/agents/queries";
import { canSeeComments } from "@/lib/comments/setting-rules";
import { toAuthorView } from "@/lib/comments/views";
import { listTeamsForUser } from "@/lib/teams/queries";
import { canManageTeam } from "@/lib/teams/roles";

import { commentExcerpt, notificationHref } from "./display-rules";
import { mayNotify, type RecipientAccess } from "./recipient-rules";
import { commentNotificationTypes, isCommentType, type NotificationType } from "./types";

/**
 * The bell: a person's notifications, newest first. Rows hold ids only; every
 * listing re-checks access, so a notification about an artifact the person can
 * no longer read (or whose comments they can no longer see) drops out, with
 * no title or excerpt. It comes back unchanged if access comes back.
 */

/** One notification as the bell shows it. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** Null when the account is gone. */
  actor: { userId: string; kind: "person" | "agent"; label: string } | null;
  artifact: { publicId: string; title: string; icon: string | null };
  /** A short plain-text excerpt of the comment. Untrusted: render as text only. Null for requests. */
  excerpt: string | null;
  /** For requests and decisions: what was asked. */
  requestKind: SharingRequestKind | null;
  href: string;
}

/** The most the bell lists, and the most the unread count counts. */
export const FEED_MAX = 50;

/**
 * The person's notification rows with what the bell needs to check and show
 * them. Joins only, with every column qualified (see subjectQuery in
 * src/lib/access.ts for why).
 */
export function feedQuery(db: Pick<ReturnType<typeof getDb>, "select">, userId: string, unreadOnly: boolean, limit: number) {
  const conditions = [eq(notification.recipientId, userId)];
  if (unreadOnly) conditions.push(isNull(notification.readAt));
  return db
    .select({
      entry: notification,
      publicId: artifact.publicId,
      latestTitle: artifact.title,
      latestIcon: artifact.icon,
      commentBody: comment.body,
      commentDeletedAt: comment.deletedAt,
      requestKind: sharingRequest.kind,
      requestTeamId: sharingRequest.teamId,
      teamSlug: team.slug,
    })
    .from(notification)
    .innerJoin(artifact, eq(artifact.id, notification.artifactId))
    .leftJoin(comment, eq(comment.id, notification.commentId))
    .leftJoin(sharingRequest, eq(sharingRequest.id, notification.requestId))
    .leftJoin(team, eq(team.id, sharingRequest.teamId))
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(limit);
}

function feedRows(userId: string, unreadOnly: boolean, limit: number) {
  return feedQuery(getDb(), userId, unreadOnly, limit);
}

type FeedRow = Awaited<ReturnType<typeof feedRows>>[number];

interface ArtifactSight {
  access: Omit<RecipientAccess, "managesRequestTeam">;
  title: string;
  icon: string | null;
}

/** What the person may see of each artifact, through the one access check. */
async function sightsFor(userId: string, publicIds: string[]): Promise<Map<string, ArtifactSight>> {
  const unique = [...new Set(publicIds)];
  const results = await Promise.all(unique.map((publicId) => getArtifactAccess(publicId, userId)));
  const sights = new Map<string, ArtifactSight>();
  unique.forEach((publicId, index) => {
    const viewable = results[index];
    if (!viewable) return;
    const { record } = viewable;
    const seesComments = canSeeComments(record.comments, { canViewArtifact: true, isAuthor: record.userId === userId, isTeamMember: viewable.isTeamMember });
    sights.set(publicId, { access: { canRead: true, seesComments }, title: viewable.served.title, icon: viewable.served.icon });
  });
  return sights;
}

/** Teams the person decides requests for (owner or admin). */
async function managedTeams(userId: string): Promise<Set<string>> {
  const teams = await listTeamsForUser(userId);
  return new Set(teams.filter((membership) => canManageTeam(membership.role)).map((membership) => membership.id));
}

interface VisibleRow {
  row: FeedRow;
  title: string;
  icon: string | null;
}

/** The rows the person may still see, with the title they may read. */
async function visibleRows(userId: string, unreadOnly: boolean, limit: number): Promise<VisibleRow[]> {
  const rows = await feedRows(userId, unreadOnly, limit);
  if (rows.length === 0) return [];
  const [sights, managed] = await Promise.all([sightsFor(userId, rows.map((row) => row.publicId)), managedTeams(userId)]);
  return rows.flatMap((row) => {
    const sight = sights.get(row.publicId);
    const managesRequestTeam = row.requestTeamId !== null && managed.has(row.requestTeamId);
    const access = { canRead: false, seesComments: false, ...sight?.access, managesRequestTeam };
    if (!mayNotify(row.entry.type, access)) return [];
    if (isCommentType(row.entry.type) && (row.commentBody === null || row.commentDeletedAt !== null)) return [];
    // A manager may not read a waiting artifact yet; the team page shows its title too.
    return [{ row, title: sight?.title ?? row.latestTitle, icon: sight ? sight.icon : row.latestIcon }];
  });
}

/** A person's notifications for the bell, newest first. */
export async function listNotifications(userId: string, options: { limit?: number } = {}): Promise<NotificationView[]> {
  const limit = Math.min(Math.max(options.limit ?? FEED_MAX, 1), FEED_MAX);
  const visible = await visibleRows(userId, false, limit);
  const actors = await loadActors(visible.flatMap(({ row }) => (row.entry.actorId ? [row.entry.actorId] : [])));
  return visible.map(({ row, title, icon }) => {
    const { entry } = row;
    const actor = entry.actorId ? actors.get(entry.actorId) : undefined;
    const author = actor ? toAuthorView(actor) : null;
    return {
      id: entry.id,
      type: entry.type,
      createdAt: entry.createdAt.toISOString(),
      readAt: entry.readAt?.toISOString() ?? null,
      actor: author ? { userId: author.userId, kind: author.kind, label: author.label } : null,
      artifact: { publicId: row.publicId, title, icon },
      excerpt: isCommentType(entry.type) && row.commentBody !== null ? commentExcerpt(row.commentBody) : null,
      requestKind: row.requestKind,
      href: notificationHref({ type: entry.type, publicId: row.publicId, teamSlug: row.teamSlug }),
    };
  });
}

/** How many unread notifications the person can still see, up to FEED_MAX. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return (await visibleRows(userId, true, FEED_MAX)).length;
}

/** Marks the matching mentions read too, so the Inbox page agrees with the bell. */
async function markMentionsRead(userId: string, commentIds: string[]) {
  if (commentIds.length === 0) return;
  await getDb()
    .update(mention)
    .set({ readAt: new Date() })
    .where(and(eq(mention.recipientId, userId), inArray(mention.commentId, commentIds), isNull(mention.readAt)));
}

/** Marks some (or all) of the person's notifications read. Returns how many changed. */
export async function markNotificationsRead(userId: string, ids: string[] | "all"): Promise<number> {
  const conditions = [eq(notification.recipientId, userId), isNull(notification.readAt)];
  if (ids !== "all") {
    if (ids.length === 0) return 0;
    conditions.push(inArray(notification.id, ids));
  }
  const changed = await getDb().update(notification).set({ readAt: new Date() }).where(and(...conditions)).returning();
  await markMentionsRead(userId, changed.flatMap((row) => (row.type === "mention" && row.commentId ? [row.commentId] : [])));
  return changed.length;
}

/** Marks the person's comment notifications on one artifact read, when they open its comments. */
export async function markArtifactNotificationsRead(userId: string, artifactId: string): Promise<void> {
  await getDb()
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.recipientId, userId), eq(notification.artifactId, artifactId), inArray(notification.type, [...commentNotificationTypes]), isNull(notification.readAt)));
}

/** Marks the mention notifications for these comments read, when the person reads them in the Inbox. */
export async function markMentionNotificationsRead(userId: string, commentIds: string[]): Promise<void> {
  if (commentIds.length === 0) return;
  await getDb()
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.recipientId, userId), inArray(notification.commentId, commentIds), isNull(notification.readAt)));
}
