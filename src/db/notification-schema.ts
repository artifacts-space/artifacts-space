import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads this file without the "@/" alias.
import { notificationTypes } from "../lib/notifications/types";

import { user } from "./auth-schema";
import { artifact, comment, sharingRequest } from "./schema";

// Notifications for people: the bell in the app header (src/lib/notifications).
// Agents never get these rows; they keep their MCP inbox (the mention table).
// Rows hold ids only. Titles and comment excerpts are read when listed, through
// the access check, so a person who lost access sees nothing of the artifact.
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: notificationTypes }).notNull(),
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    // The comment for comment, reply, and mention.
    commentId: text("comment_id").references(() => comment.id, { onDelete: "cascade" }),
    // The sharing request for share_request, share_approved, and share_declined.
    requestId: text("request_id").references(() => sharingRequest.id, { onDelete: "cascade" }),
    // Who did it: the comment's author, the requester, or the owner or admin who decided.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    // One notification per person per comment: the most direct kind wins (mention, reply, comment).
    uniqueIndex("notification_recipient_comment_idx").on(table.recipientId, table.commentId).where(sql`${table.commentId} is not null`),
    uniqueIndex("notification_recipient_request_type_idx").on(table.recipientId, table.requestId, table.type).where(sql`${table.requestId} is not null`),
    index("notification_recipient_created_idx").on(table.recipientId, table.createdAt),
    index("notification_recipient_artifact_idx").on(table.recipientId, table.artifactId),
    check("notification_type_check", sql`${table.type} in ('comment', 'reply', 'mention', 'share_request', 'share_approved', 'share_declined')`),
  ],
);

// A person's notification settings: which channels each event uses
// (src/lib/notifications/preference-rules.ts). No row means the defaults.
export const notificationSetting = pgTable("notification_setting", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationRecord = typeof notification.$inferSelect;
