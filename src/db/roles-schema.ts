import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file without the "@/" alias.
import { team, teamMember, user } from "./auth-schema";

/*
 * Team roles and what each may do (src/lib/teams/capability-rules.ts).
 * Every team has the built-in roles owner, admin, member, and agent, and may
 * add its own. A person's built-in role stays in team_member.role, which
 * Better Auth reads; a custom role is an assignment on top of it. Every
 * change to a role or a member's role writes a team_permission_audit row.
 */

export const teamRole = pgTable(
  "team_role",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    // owner, admin, member, agent, or a custom role's slug.
    key: text("key").notNull(),
    name: text("name").notNull(),
    builtIn: boolean("built_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_role_team_key_idx").on(table.teamId, table.key),
    check("team_role_key_length_check", sql`char_length(${table.key}) between 1 and 40`),
    check("team_role_name_length_check", sql`char_length(${table.name}) between 1 and 40`),
  ],
);

// One row per capability a role holds. Unknown capability names grant nothing.
export const teamRoleCapability = pgTable(
  "team_role_capability",
  {
    roleId: text("role_id").notNull().references(() => teamRole.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.capability] })],
);

// A person's custom role. Deleting the role drops the assignment, and the person keeps their built-in role.
export const teamRoleAssignment = pgTable(
  "team_role_assignment",
  {
    memberId: text("member_id").primaryKey().references(() => teamMember.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull().references(() => teamRole.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("team_role_assignment_role_idx").on(table.roleId)],
);

// Who changed a role or a member's role, what, and the value before and after.
export const teamPermissionAudit = pgTable(
  "team_permission_audit",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    // role_created, role_updated, role_deleted, or member_role_changed.
    action: text("action").notNull(),
    // The role's name, or the member's name, at the time of the change.
    subject: text("subject").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("team_permission_audit_team_idx").on(table.teamId, table.createdAt)],
);
