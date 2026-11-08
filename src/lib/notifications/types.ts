/**
 * Notification kinds and settings for people. Agents keep their MCP inbox
 * (src/lib/comments/inbox.ts) and never get these. The schema imports this
 * file with a relative path, so it imports nothing with the "@/" alias.
 */

/**
 * What happened, as stored on a notification row.
 * comment: a new comment on an artifact the person (or an agent they added) wrote.
 * reply: a reply to the person's comment. mention: an @mention of the person.
 * share_request: a request waiting for the person's approval (team owners and admins).
 * share_approved, share_declined: the person's request was decided.
 */
export const notificationTypes = ["comment", "reply", "mention", "share_request", "share_approved", "share_declined"] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** The comment kinds, which carry a comment and an excerpt. */
export const commentNotificationTypes = ["comment", "reply", "mention"] as const satisfies readonly NotificationType[];
export type CommentNotificationType = (typeof commentNotificationTypes)[number];

/** The events a person sets channels for in settings. Approved and declined share one setting. */
export const notificationEvents = ["mention", "reply", "comment", "share_request", "share_decision"] as const;
export type NotificationEvent = (typeof notificationEvents)[number];

/** Where a notification can reach a person. */
export const notificationChannels = ["inApp", "browser", "email"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

/** Longest push address stored, in characters. Real ones are a few hundred. */
export const MAX_ENDPOINT_LENGTH = 1000;

/** The setting that controls a stored type. */
export function eventForType(type: NotificationType): NotificationEvent {
  if (type === "share_approved" || type === "share_declined") return "share_decision";
  return type;
}

/** True for the kinds that come from a comment. */
export function isCommentType(type: NotificationType): type is CommentNotificationType {
  return type === "comment" || type === "reply" || type === "mention";
}
