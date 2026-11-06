import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file without the "@/" alias.
import { artifactKinds, artifactVisibilities, sharingRequestStatuses, sharingLevels } from "../lib/artifact-types";

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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull(),
    kind: text("kind", { enum: artifactKinds })
      .notNull()
      .default("markdown"),
    language: text("language").notNull().default(""),
    project: text("project").notNull().default(""),
    sessionId: text("session_id").notNull().default(""),
    source: text("source").notNull().default(""),
    // private: author only. team: members of `teamId`. link: anyone with the URL. public: anyone.
    visibility: text("visibility", { enum: artifactVisibilities })
      .notNull()
      .default("private"),
    // Legacy /share/<shareId> links redirect to /artifact/<publicId>.
    shareId: text("share_id").notNull(),
    // 22-character random base58 id. The canonical URL is /artifact/<publicId>.
    publicId: text("public_id").notNull().default(sql`generate_public_id()`),
    // The team the artifact is shared with (team), or whose admins approved it (link, public).
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    // Set when the author left the team and a team owner took the artifact over.
    originalAuthorId: text("original_author_id").references(() => user.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_share_id_idx").on(table.shareId),
    uniqueIndex("artifact_public_id_idx").on(table.publicId),
    index("artifact_user_updated_idx").on(table.userId, table.updatedAt),
    index("artifact_user_project_idx").on(table.userId, table.project),
    index("artifact_team_updated_idx").on(table.teamId, table.updatedAt),
  ],
);

// A request to share an artifact that waits for a team owner's or admin's decision.
export const sharingRequest = pgTable(
  "sharing_request",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifact.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The requested level: team, link, or public.
    visibility: text("visibility", { enum: sharingLevels }).notNull(),
    status: text("status", { enum: sharingRequestStatuses }).notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one open request per artifact.
    uniqueIndex("sharing_request_pending_artifact_idx").on(table.artifactId).where(sql`${table.status} = 'pending'`),
    index("sharing_request_team_status_idx").on(table.teamId, table.status),
  ],
);

export const apiToken = pgTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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

export type ArtifactRecord = typeof artifact.$inferSelect;
export type TeamRecord = typeof team.$inferSelect;
export type SharingRequestRecord = typeof sharingRequest.$inferSelect;
export type ApiTokenRecord = typeof apiToken.$inferSelect;
