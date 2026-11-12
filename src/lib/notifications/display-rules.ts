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
  [/`+/g, ""],
  [/<[^>]*>/g, ""],
];

const EMPHASIS_RUN = /[*_~]+/g;
const SPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;

/**
 * Emphasis marks off, literal characters kept: a run of `*`, `_`, or `~`
 * with spaces on both sides ("2 * 3") and an underscore inside a word
 * ("snake_case") are text, not marks.
 */
function stripEmphasis(text: string): string {
  return text.replace(EMPHASIS_RUN, (run: string, offset: number) => {
    const before = text.charAt(offset - 1);
    const after = text.charAt(offset + run.length);
    const spaced = SPACE.test(before) && SPACE.test(after);
    const inWord = run.startsWith("_") && WORD.test(before) && WORD.test(after);
    return spaced || inWord ? run : "";
  });
}

/** A backslash escape in Markdown: a backslash before ASCII punctuation, which stands for that character. */
const BACKSLASH_ESCAPE = /\\([!-/:-@[-`{-~])/g;
/** Private-use characters stand in for escaped punctuation while the Markdown marks come off. */
const PRIVATE_USE = /[\uE000-\uE07F]/g;
const STAND_IN = 0xe000;

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g;

/** One character for a numeric entity, or the replacement character for one that names no character. */
function fromCodePoint(codePoint: number): string {
  const valid = codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
  return valid ? String.fromCodePoint(codePoint) : "\uFFFD";
}

/** The basic entities as their characters, in one pass so `&amp;lt;` reads "&lt;", not "<". */
function decodeEntities(text: string): string {
  return text.replace(ENTITY, (_match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (decimal !== undefined) return fromCodePoint(Number(decimal));
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
    return NAMED_ENTITIES[name ?? ""] ?? "";
  });
}

/**
 * A short plain-text excerpt of a comment: Markdown marks, links' addresses,
 * and tags removed, escapes and basic entities read as the characters the
 * writer typed (`\\*` is "*", `&amp;` is "&"), whitespace collapsed, cut at
 * EXCERPT_MAX. Comment text is untrusted; the bell renders this as plain
 * text, never as HTML or Markdown.
 */
export function commentExcerpt(body: string, max: number = EXCERPT_MAX): string {
  // Escaped characters are not marks: they stand aside as private-use characters while the marks come off.
  let text = body.replace(PRIVATE_USE, "").replace(BACKSLASH_ESCAPE, (_match, char: string) => String.fromCharCode(STAND_IN + char.charCodeAt(0) - 0x20));
  for (const [pattern, replacement] of markdownPatterns) text = text.replace(pattern, replacement);
  text = stripEmphasis(text);
  text = decodeEntities(text.replace(PRIVATE_USE, (char) => String.fromCharCode(char.charCodeAt(0) - STAND_IN + 0x20)));
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
