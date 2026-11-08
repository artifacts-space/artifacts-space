import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file without the "@/" alias.
import {
  artifactKinds,
  artifactVisibilities,
  commentSettings,
  reportReasons,
  reportStatuses,
  sharingLevels,
  sharingRequestKinds,
  sharingRequestStatuses,
  versionSaveKinds,
} from "../lib/artifact-types";
import { artifactIconLimits } from "../lib/artifact-icon-limits";
import type { StoredArtifactTheme } from "../lib/themes/artifact-theme";
import { artifactThemeLimits } from "../lib/themes/artifact-theme-limits";
import { artifactSizeLimits } from "../lib/artifact-limits";
import { fileLimits, fileStatuses } from "../lib/files/config";
import { projectLimits } from "../lib/projects/limits";
import { tagLimits } from "../lib/tags/limits";

// Better Auth tables. Column names follow Better Auth's core schema.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Lowercase handle, unique across users. It is also the personal team's slug.
  // Nullable only so that older code paths can never fail a sign-up; the app
  // assigns one on first use.
  username: text("username").unique(),
  // False until the person keeps or picks their username once.
  usernameConfirmed: boolean("username_confirmed").notNull().default(false),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // Better Auth's organization plugin field `activeOrganizationId`.
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("account_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Teams. Better Auth's organization plugin manages these three tables; the app
// calls them teams everywhere. The adapter maps organization -> team,
// member -> teamMember, and invitation -> teamInvitation (see src/lib/auth).

export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Every user owns exactly one personal team. It approves its own sharing.
    personal: boolean("personal").notNull().default(false),
    // The team's sharing rule: does sharing with the team need an admin's approval?
    teamSharingNeedsApproval: boolean("team_sharing_needs_approval").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("team_personal_owner_idx").on(table.createdBy).where(sql`${table.personal}`),
  ],
);

export const teamMember = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_member_team_user_idx").on(table.teamId, table.userId),
    index("team_member_user_idx").on(table.userId),
  ],
);

export const teamInvitation = pgTable(
  "team_invitation",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("team_invitation_team_idx").on(table.teamId),
    index("team_invitation_email_idx").on(table.email),
  ],
);

export const artifact = pgTable(
  "artifact",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Optional page icon beside the title: one emoji, or "tabler:<name>" from src/lib/artifact-icons.ts.
    icon: text("icon"),
    // Optional theme: a preset id (a JSON string) or theme JSON normalised by src/lib/themes. Null uses the default look.
    theme: jsonb("theme").$type<StoredArtifactTheme>(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull(),
    kind: text("kind", { enum: artifactKinds }).notNull().default("markdown"),
    language: text("language").notNull().default(""),
    // Deprecated: the free-text label from before projects were rows. Not read; project_id replaced it.
    project: text("project").notNull().default(""),
    // The artifact's project, in its home scope (src/lib/projects). Null is "No project". Not versioned.
    projectId: text("project_id").references((): AnyPgColumn => project.id, { onDelete: "set null" }),
    // Normalized tags (src/lib/tags), for the author and team only. Not versioned.
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    sessionId: text("session_id").notNull().default(""),
    source: text("source").notNull().default(""),
    // private: author only. team: members of `teamId`. link: anyone with the URL. public: anyone.
    visibility: text("visibility", { enum: artifactVisibilities }).notNull().default("private"),
    // Who can read and write its comments: off, team (the author and the team), or signed_in
    // (anyone signed in who can read it). The app always sets it on insert. 0015 added it with
    // the default signed_in (how comments worked before), and 0017 moved the default to team,
    // so an insert that forgets it fails narrow.
    comments: text("comments", { enum: commentSettings }).notNull().default("team"),
    // Legacy /share/<shareId> links redirect to /artifact/<publicId>.
    shareId: text("share_id").notNull(),
    // 22-character random base58 id. The canonical URL is /artifact/<publicId>.
    publicId: text("public_id").notNull().default(sql`generate_public_id()`),
    // The team the artifact is shared with (team), or whose admins approved it (link, public).
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    // Set when the author left the team and a team owner took the artifact over.
    originalAuthorId: text("original_author_id").references(() => user.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    // Link and public artifacts: the version readers outside the team see. Edits wait for approval.
    approvedVersionId: text("approved_version_id").references((): AnyPgColumn => artifactVersion.id, { onDelete: "set null" }),
    // Who saved the content or metadata last: the author, a teammate, or an agent.
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_share_id_idx").on(table.shareId),
    uniqueIndex("artifact_public_id_idx").on(table.publicId),
    index("artifact_user_updated_idx").on(table.userId, table.updatedAt),
    index("artifact_user_project_idx").on(table.userId, table.project),
    index("artifact_project_idx").on(table.projectId),
    index("artifact_tags_idx").using("gin", table.tags),
    index("artifact_team_updated_idx").on(table.teamId, table.updatedAt),
    check("artifact_tags_count_check", sql`cardinality(${table.tags}) <= ${sql.raw(String(tagLimits.maxPerArtifact))}`),
    check("artifact_comments_check", sql`${table.comments} in ('off', 'team', 'signed_in')`),
    check("artifact_icon_length_check", sql`char_length(${table.icon}) <= ${sql.raw(String(artifactIconLimits.maxStoredChars))}`),
    check("artifact_theme_size_check", sql`octet_length(${table.theme}::text) <= ${sql.raw(String(artifactThemeLimits.maxStoredBytes))}`),
    check("artifact_content_size_check", sql`octet_length(${table.content}) <= ${sql.raw(String(artifactSizeLimits.maxContentBytes))}`),
    // jsonb prints with extra spaces, so the backstop allows twice the app's limit.
    check("artifact_metadata_size_check", sql`octet_length(${table.metadata}::text) <= ${sql.raw(String(artifactSizeLimits.maxMetadataBytes * 2))}`),
  ],
);

// A saved copy of an artifact: one per save, so the history covers every
// visibility. Quick saves by the same editor merge into the latest version.
// Link and public artifacts also point at one as their approved version.
export const artifactVersion = pgTable(
  "artifact_version",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id")
      .notNull()
      .references((): AnyPgColumn => artifact.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // The page icon this version showed, versioned with the title.
    icon: text("icon"),
    // The theme this version showed, versioned with the title and icon.
    theme: jsonb("theme").$type<StoredArtifactTheme>(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull(),
    kind: text("kind", { enum: artifactKinds }).notNull(),
    language: text("language").notNull().default(""),
    project: text("project").notNull().default(""),
    source: text("source").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // The last save merged into this version. Equals created_at until a quick follow-up save merges in.
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    saveKind: text("save_kind", { enum: versionSaveKinds }).notNull().default("edit"),
    // For a restore: the version it brought back.
    restoredFromId: text("restored_from_id").references((): AnyPgColumn => artifactVersion.id, { onDelete: "set null" }),
    // Content plus metadata size, for the storage quota.
    bytes: integer("bytes").notNull().default(0),
  },
  (table) => [
    index("artifact_version_artifact_created_idx").on(table.artifactId, table.createdAt),
    index("artifact_version_saved_idx").on(table.savedAt),
  ],
);

// A named group of artifacts in one scope: a person's own (team_id null) or a
// shared team's (user_id null). Names are unique per scope by name_key.
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The normalized name in lowercase, for case-insensitive matching (src/lib/projects/rules.ts).
    nameKey: text("name_key").notNull(),
    // One emoji or "tabler:<name>", like an artifact icon but never an uploaded file.
    icon: text("icon"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_user_key_idx").on(table.userId, table.nameKey).where(sql`${table.userId} is not null`),
    uniqueIndex("project_team_key_idx").on(table.teamId, table.nameKey).where(sql`${table.teamId} is not null`),
    check("project_scope_check", sql`(${table.userId} is null) <> (${table.teamId} is null)`),
    check("project_name_check", sql`char_length(${table.name}) between 1 and ${sql.raw(String(projectLimits.maxNameChars))}`),
    check("project_icon_length_check", sql`char_length(${table.icon}) <= ${sql.raw(String(artifactIconLimits.maxStoredChars))}`),
  ],
);

// A request to share an artifact that waits for a team owner's or admin's decision.
export const sharingRequest = pgTable(
  "sharing_request",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull().references(() => user.id, { onDelete: "cascade" }),
    // sharing: a change of who can read it. edit: changed content of a link or public artifact.
    kind: text("kind", { enum: sharingRequestKinds }).notNull().default("sharing"),
    // The requested level: team, link, or public. For an edit, the level it is shared at.
    visibility: text("visibility", { enum: sharingLevels }).notNull(),
    // For sharing and comments requests: who may comment once it is approved.
    comments: text("comments", { enum: commentSettings }),
    // For an edit: the version waiting for approval.
    versionId: text("version_id").references(() => artifactVersion.id, { onDelete: "cascade" }),
    status: text("status", { enum: sharingRequestStatuses }).notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one open request of each kind per artifact.
    uniqueIndex("sharing_request_pending_artifact_kind_idx").on(table.artifactId, table.kind).where(sql`${table.status} = 'pending'`),
    index("sharing_request_team_status_idx").on(table.teamId, table.status),
  ],
);

export const apiToken = pgTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_token_hash_idx").on(table.tokenHash),
    index("api_token_user_idx").on(table.userId),
  ],
);

// Fixed-window counters for rate limits. Old windows are deleted as they expire.
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] }), index("rate_limit_bucket_window_idx").on(table.windowStart)],
);

// A reader's report about a link or public artifact, for the owning team's owners and admins.
export const artifactReport = pgTable(
  "artifact_report",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    // The team that approved the sharing when the report arrived.
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    reason: text("reason", { enum: reportReasons }).notNull(),
    details: text("details").notNull().default(""),
    // Signed-in reporters only. Signed-out reports keep a hashed network key instead.
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reporterKey: text("reporter_key").notNull(),
    status: text("status", { enum: reportStatuses }).notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("artifact_report_team_status_idx").on(table.teamId, table.status),
    index("artifact_report_artifact_idx").on(table.artifactId),
  ],
);

// Files (owned by the files work). An upload stored in R2. It is pending until
// the upload is checked, and belongs to at most one artifact once attached.
// Readers reach it only through that artifact's access check.
export const artifactFile = pgTable(
  "artifact_file",
  {
    id: text("id").primaryKey(),
    // Null after the uploader's account is deleted; the cleanup job then removes it.
    uploaderId: text("uploader_id").references(() => user.id, { onDelete: "set null" }),
    // Null until attached. Deleting the artifact deletes its files; set null is the backstop.
    artifactId: text("artifact_id").references(() => artifact.id, { onDelete: "set null" }),
    // The R2 object key: files/<id>/<sanitized filename>. Generated by the server.
    key: text("key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    status: text("status", { enum: fileStatuses }).notNull().default("pending"),
    // When it joined its artifact. Readers of an approved version see files attached before it.
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_file_key_idx").on(table.key),
    index("artifact_file_artifact_idx").on(table.artifactId),
    index("artifact_file_uploader_status_idx").on(table.uploaderId, table.status),
    index("artifact_file_status_created_idx").on(table.status, table.createdAt),
    check("artifact_file_size_check", sql`${table.size} > 0 and ${table.size} <= ${sql.raw(String(fileLimits.maxBytes))}`),
  ],
);

// ---------------------------------------------------------------------------
// Agents as teammates: agent members, comment threads, mentions, and mutes.
// ---------------------------------------------------------------------------

// An agent is a `user` row with this companion row. It has a handle (the
// user's username), a reserved unroutable email, no sign-in method, exactly one
// team, and the person who added it. Its API tokens are ordinary `api_token`
// rows for the agent's user id.
export const agent = pgTable(
  "agent",
  {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    // The person who added the agent. Work is shown as "by @agent for <owner>".
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    // Set when a team owner or admin mutes the agent across the team.
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    mutedBy: text("muted_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // agent_owner_idx: the storage quota sums an account (a person and the agents they own) by owner.
  (table) => [index("agent_team_idx").on(table.teamId), index("agent_owner_idx").on(table.ownerId)],
);

// A comment on an artifact. All comments on one artifact form its thread;
// `parentId` points at the top-level comment a reply answers.
export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    // Null once the author's account is gone. The comment stays in the thread.
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    parentId: text("parent_id").references((): AnyPgColumn => comment.id, { onDelete: "set null" }),
    // Markdown. Rendered without raw HTML and with the artifact link policy.
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete keeps replies in place and rate limits honest.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("comment_artifact_created_idx").on(table.artifactId, table.createdAt),
    index("comment_author_created_idx").on(table.authorId, table.createdAt),
  ],
);

// An inbox entry: a mention that landed. Refused mentions are never stored.
export const mention = pgTable(
  "mention",
  {
    id: text("id").primaryKey(),
    commentId: text("comment_id").notNull().references(() => comment.id, { onDelete: "cascade" }),
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mention_comment_recipient_idx").on(table.commentId, table.recipientId),
    index("mention_recipient_created_idx").on(table.recipientId, table.createdAt),
  ],
);

// A person muted an agent in one artifact's thread.
export const threadMute = pgTable(
  "thread_mute",
  {
    artifactId: text("artifact_id").notNull().references(() => artifact.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    mutedBy: text("muted_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.agentId] })],
);

// A person chose "Don't ask again" for one kind of destructive confirmation.
// Only the dialog changes; server checks stay the same.
export const confirmationSkip = pgTable(
  "confirmation_skip",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.action] })],
);

export type ArtifactRecord = typeof artifact.$inferSelect;
export type ProjectRecord = typeof project.$inferSelect;
export type TeamRecord = typeof team.$inferSelect;
export type SharingRequestRecord = typeof sharingRequest.$inferSelect;
export type ApiTokenRecord = typeof apiToken.$inferSelect;
export type ArtifactVersionRecord = typeof artifactVersion.$inferSelect;
export type ArtifactReportRecord = typeof artifactReport.$inferSelect;
export type ArtifactFileRecord = typeof artifactFile.$inferSelect;
export type AgentRecord = typeof agent.$inferSelect;
export type CommentRecord = typeof comment.$inferSelect;
export type MentionRecord = typeof mention.$inferSelect;
