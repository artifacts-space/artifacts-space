import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { notification } from "@/db/notification-schema";
import { agent, artifact, comment, mention, sharingRequest, team, teamMember, user } from "@/db/schema";
import { getArtifactAccess } from "@/lib/access";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import type { Actor } from "@/lib/agents/identity";
import { canSeeComments } from "@/lib/comments/setting-rules";

import { afterResponse } from "./after-response";
import { readPreferences } from "./preference-rules";
import { loadPreferences } from "./preferences";
import { sendBrowserNotifications, type BrowserContext } from "./push/notify";
import {
  commentRecipients,
  draftsFor,
  shareDecisionRecipient,
  shareRequestRecipients,
  type NotificationDraft,
  type Party,
  type RecipientAccess,
} from "./recipient-rules";

/**
 * Creates notifications for people when something happens: a comment, a
 * sharing request, or a decision on one. Each entry point schedules the work
 * after the response, so the action that caused it never waits or fails
 * because of it. Every recipient passes the one access check first.
 */

/** What a batch of notifications points at. */
interface Target extends BrowserContext {
  artifactId: string;
  commentId?: string;
  requestId?: string;
  /** The latest title, shown to managers who may not read a waiting artifact yet (as the team page does). */
  latestTitle: string;
  /** People who manage the request's team, for share_request. */
  managers?: ReadonlySet<string>;
}

/** What one recipient may see now, and the title they may read. */
interface Sight {
  access: RecipientAccess;
  title: string | null;
}

const noAccess: RecipientAccess = { canRead: false, seesComments: false, managesRequestTeam: false };

/** Parties by user id: people, and agents with the person who added them. */
async function loadParties(userIds: readonly (string | null)[]): Promise<Map<string, Party>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ userId: user.id, agentId: agent.userId, ownerId: agent.ownerId })
    .from(user)
    .leftJoin(agent, eq(agent.userId, user.id))
    .where(inArray(user.id, ids));
  return new Map(rows.map((row) => [row.userId, { userId: row.userId, kind: row.agentId ? "agent" : "person", ownerId: row.ownerId }]));
}

/** What one recipient may see now, through the one access check and the comments setting. */
async function sightOf(publicId: string, recipientId: string, managers: ReadonlySet<string> | undefined): Promise<Sight> {
  const viewable = await getArtifactAccess(publicId, recipientId);
  const managesRequestTeam = managers?.has(recipientId) ?? false;
  if (!viewable) return { access: { ...noAccess, managesRequestTeam }, title: null };
  const { record } = viewable;
  const seesComments = canSeeComments(record.comments, { canViewArtifact: true, isAuthor: record.userId === recipientId, isTeamMember: viewable.isTeamMember });
  return { access: { canRead: true, seesComments, managesRequestTeam }, title: viewable.served.title };
}

async function storeInApp(drafts: readonly NotificationDraft[], target: Target) {
  if (drafts.length === 0) return;
  const rows = drafts.map((draft) => ({
    id: randomUUID(),
    recipientId: draft.recipientId,
    type: draft.type,
    artifactId: target.artifactId,
    commentId: target.commentId ?? null,
    requestId: target.requestId ?? null,
    actorId: target.actorId,
  }));
  if (target.commentId) {
    // An edit that adds a mention turns an earlier comment or reply notification into an unread mention.
    await getDb()
      .insert(notification)
      .values(rows)
      .onConflictDoUpdate({
        target: [notification.recipientId, notification.commentId],
        targetWhere: sql`${notification.commentId} is not null`,
        set: { type: sql`excluded.type`, readAt: null, createdAt: sql`now()` },
        setWhere: sql`excluded.type = 'mention' and ${notification.type} <> 'mention'`,
      });
    return;
  }
  await getDb().insert(notification).values(rows).onConflictDoNothing();
}

/**
 * Checks access and settings for each draft, stores the ones that reach the
 * bell, and sends the ones that reach the browser. A failed browser send
 * never undoes the bell.
 */
async function deliver(drafts: readonly NotificationDraft[], target: Target) {
  if (drafts.length === 0) return;
  const ids = drafts.map((draft) => draft.recipientId);
  const [sightList, preferences] = await Promise.all([Promise.all(ids.map((id) => sightOf(target.publicId, id, target.managers))), loadPreferences(ids)]);
  const sights = new Map(ids.map((id, index) => [id, sightList[index]]));
  const facts = { access: (id: string) => sights.get(id)?.access ?? noAccess, preferences: (id: string) => preferences.get(id) ?? readPreferences(undefined) };
  const titleFor = (id: string) => sights.get(id)?.title ?? target.latestTitle;
  await Promise.all([
    storeInApp(draftsFor(drafts, "inApp", facts), target),
    sendBrowserNotifications(draftsFor(drafts, "browser", facts), target, titleFor).catch((error: unknown) => {
      console.error("[notifications] Browser notifications failed", error instanceof Error ? error.name : "unknown error");
    }),
  ]);
}

/** People (never agents) whose mention in this comment landed. */
async function mentionedPeople(commentId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ recipientId: mention.recipientId })
    .from(mention)
    .leftJoin(agent, eq(agent.userId, mention.recipientId))
    .where(and(eq(mention.commentId, commentId), isNull(agent.userId)));
  return rows.map((row) => row.recipientId);
}

async function commentBody(commentId: string): Promise<string | null> {
  const [row] = await getDb().select({ body: comment.body }).from(comment).where(eq(comment.id, commentId)).limit(1);
  return row?.body ?? null;
}

async function parentAuthorId(parentId: string | null): Promise<string | null> {
  if (!parentId) return null;
  const [row] = await getDb().select({ authorId: comment.authorId }).from(comment).where(eq(comment.id, parentId)).limit(1);
  return row?.authorId ?? null;
}

/** The input for a new or edited comment. */
export interface CommentEvent {
  artifact: Pick<ArtifactMetaRecord, "id" | "publicId" | "userId" | "title">;
  commentId: string;
  parentId: string | null;
  writer: Actor;
  /** The writer is an agent muted in this thread. */
  writerThreadMuted: boolean;
  /** An edit: only people newly mentioned hear about it. */
  edited?: boolean;
}

async function commentNotifications(event: CommentEvent) {
  const [mentioned, parentAuthor, body] = await Promise.all([mentionedPeople(event.commentId), parentAuthorId(event.parentId), commentBody(event.commentId)]);
  const parties = await loadParties([event.artifact.userId, parentAuthor]);
  const drafts = commentRecipients({
    writerId: event.writer.userId,
    writerMuted: event.writer.kind === "agent" && (event.writer.teamMuted || event.writerThreadMuted),
    artifactAuthor: parties.get(event.artifact.userId) ?? null,
    parentAuthor: parentAuthor ? parties.get(parentAuthor) ?? null : null,
    mentionedPeople: mentioned,
  });
  const chosen = event.edited ? drafts.filter((draft) => draft.type === "mention") : drafts;
  const { id: artifactId, publicId, title: latestTitle } = event.artifact;
  await deliver(chosen, { artifactId, publicId, latestTitle, actorId: event.writer.userId, commentId: event.commentId, commentBody: body, requestKind: null, teamSlug: null });
}

/** Notifies people about a new or edited comment, after the response. */
export function notifyComment(event: CommentEvent): void {
  afterResponse("Comment notifications", () => commentNotifications(event));
}

async function loadRequest(requestId: string) {
  const [row] = await getDb()
    .select({ request: sharingRequest, publicId: artifact.publicId, latestTitle: artifact.title, teamSlug: team.slug })
    .from(sharingRequest)
    .innerJoin(artifact, eq(artifact.id, sharingRequest.artifactId))
    .leftJoin(team, eq(team.id, sharingRequest.teamId))
    .where(eq(sharingRequest.id, requestId))
    .limit(1);
  return row ?? null;
}

async function teamManagers(teamId: string) {
  const rows = await getDb()
    .select({ userId: teamMember.userId, agentId: agent.userId })
    .from(teamMember)
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .where(and(eq(teamMember.teamId, teamId), inArray(teamMember.role, ["owner", "admin"])));
  return rows.map((row) => ({ userId: row.userId, isAgent: row.agentId !== null }));
}

async function requestNotifications(requestId: string) {
  const loaded = await loadRequest(requestId);
  if (loaded?.request.status !== "pending") return;
  const { request, publicId, latestTitle, teamSlug } = loaded;
  const [managers, parties] = await Promise.all([teamManagers(request.teamId), loadParties([request.requestedBy])]);
  const requester = parties.get(request.requestedBy);
  if (!requester) return;
  const drafts = shareRequestRecipients({ requester, managers });
  const managerIds = new Set(managers.map((manager) => manager.userId));
  await deliver(drafts, { artifactId: request.artifactId, publicId, latestTitle, actorId: request.requestedBy, requestId, managers: managerIds, commentBody: null, requestKind: request.kind, teamSlug });
}

/** Tells a team's owners and admins that a request waits for them, after the response. */
export function notifySharingRequest(requestId: string): void {
  afterResponse("Request notifications", () => requestNotifications(requestId));
}

async function decisionNotifications(requestId: string) {
  const loaded = await loadRequest(requestId);
  const deciderId = loaded?.request.decidedBy ?? null;
  if (!loaded || !deciderId) return;
  const { request, publicId, latestTitle, teamSlug } = loaded;
  const parties = await loadParties([request.requestedBy]);
  const draft = shareDecisionRecipient({ status: request.status, requester: parties.get(request.requestedBy) ?? null, deciderId });
  if (!draft) return;
  await deliver([draft], { artifactId: request.artifactId, publicId, latestTitle, actorId: deciderId, requestId, commentBody: null, requestKind: request.kind, teamSlug });
}

/** Tells the requester (or the person whose agent asked) that their request was decided, after the response. */
export function notifySharingDecision(requestId: string): void {
  afterResponse("Decision notifications", () => decisionNotifications(requestId));
}
