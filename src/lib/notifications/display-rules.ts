import type { SharingRequestKind } from "@/lib/artifact-types";
import { teamTabHref } from "@/lib/teams/team-tabs-rules";

import type { NotificationType } from "./types";

/**
 * Pure rules for how notifications read: the short excerpt, the sentence,
 * where a click goes, and how the bell groups them.
 */

/** Longest excerpt of a comment, in characters. */
export const EXCERPT_MAX = 140;

const markdownPatterns: readonly [RegExp, string][] = [
  [/```[^\n]*\n?/g, " "],
  [/!\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, ""],
  [/[*_~`]+/g, ""],
  [/<[^>]*>/g, ""],
];

/**
 * A short plain-text excerpt of a comment: Markdown marks, links' addresses,
 * and tags removed, whitespace collapsed, cut at EXCERPT_MAX. Comment text is
 * untrusted; the bell renders this as plain text, never as HTML or Markdown.
 */
export function commentExcerpt(body: string, max: number = EXCERPT_MAX): string {
  let text = body;
  for (const [pattern, replacement] of markdownPatterns) text = text.replace(pattern, replacement);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Where a notification opens: the artifact in /app with its comments, the team's approval queue for a request, or the artifact. */
export function notificationHref(input: { type: NotificationType; publicId: string; teamSlug: string | null }): string {
  const artifact = `/app?artifact=${encodeURIComponent(input.publicId)}`;
  if (input.type === "share_request") return input.teamSlug ? teamTabHref(input.teamSlug, "artifacts", "approval") : artifact;
  if (input.type === "share_approved" || input.type === "share_declined") return artifact;
  return `${artifact}&comments=1`;
}

const requestObjects: Record<SharingRequestKind, string> = {
  sharing: "to share",
  comments: "to open comments on",
  edit: "to publish changes to",
};

const decisionObjects: Record<SharingRequestKind, string> = {
  sharing: "sharing",
  comments: "opening comments on",
  edit: "your changes to",
};

/**
 * What the actor did, between their name and the artifact's title:
 * "commented on", "asked to share", "approved your changes to".
 */
export function actionPhrase(type: NotificationType, requestKind: SharingRequestKind | null): string {
  const kind = requestKind ?? "sharing";
  if (type === "comment") return "commented on";
  if (type === "reply") return "replied to your comment on";
  if (type === "mention") return "mentioned you on";
  if (type === "share_request") return `asked ${requestObjects[kind]}`;
  return `${type === "share_approved" ? "approved" : "declined"} ${decisionObjects[kind]}`;
}

/** "Ada", "Ada and Bo", "Ada and 2 others". Labels are newest first and unique. */
export function actorsLabel(labels: readonly string[]): string {
  const [first, second] = labels;
  if (!first) return "Someone";
  if (!second) return first;
  if (labels.length === 2) return `${first} and ${second}`;
  return `${first} and ${String(labels.length - 1)} others`;
}

/** The fields grouping needs. */
export interface GroupableNotification {
  id: string;
  type: NotificationType;
  readAt: string | null;
  artifact: { publicId: string };
  actor: { userId: string } | null;
}

/** Notifications shown as one row. `items` are newest first. */
export interface NotificationGroup<T extends GroupableNotification> {
  key: string;
  items: T[];
  unread: boolean;
}

/** Plain comments and replies on one artifact fold into one row; mentions and requests stay on their own. */
function groupKey(item: GroupableNotification): string {
  const unread = item.readAt === null ? "unread" : "read";
  if (item.type === "comment" || item.type === "reply") return `${item.type}:${item.artifact.publicId}:${unread}`;
  return `${item.type}:${item.id}`;
}

/**
 * Groups a newest-first list for the bell: new comments (or replies) on the
 * same artifact fold into one row ("Ada and 2 others commented on …"), apart
 * from read ones. Rows keep the order of their newest item.
 */
export function groupNotifications<T extends GroupableNotification>(items: readonly T[]): NotificationGroup<T>[] {
  const groups = new Map<string, NotificationGroup<T>>();
  for (const item of items) {
    const key = groupKey(item);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, items: [item], unread: item.readAt === null });
  }
  return [...groups.values()];
}

/** The unique actor ids in a group, newest first. */
export function groupActorIds(items: readonly GroupableNotification[]): string[] {
  return [...new Set(items.flatMap((item) => (item.actor ? [item.actor.userId] : [])))];
}
