import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file without the "@/" alias.
import { teamPresetLimits } from "../lib/themes/team-preset-limits";

/*
 * Accounts and teams: Better Auth's core tables and its organization plugin's
 * tables. Kept apart from schema.ts (which re-exports them) to stay under the
 * 500-line limit. drizzle-kit reads them through schema.ts, so this file is
 * not listed in drizzle.config.ts.
 */

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
    // The team default theme: a built-in preset id or "team:<slug>" of one of its presets
    // (src/lib/themes/team-preset-rules.ts). Null uses the site default. Set by owners and admins.
    defaultTheme: text("default_theme"),
    // Who set the team default last, and when, for an audit trail.
    defaultThemeSetBy: text("default_theme_set_by").references(() => user.id, { onDelete: "set null" }),
    defaultThemeSetAt: timestamp("default_theme_set_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("team_personal_owner_idx").on(table.createdBy).where(sql`${table.personal}`),
    check("team_default_theme_length_check", sql`char_length(${table.defaultTheme}) <= ${sql.raw(String(teamPresetLimits.maxRefChars))}`),
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
