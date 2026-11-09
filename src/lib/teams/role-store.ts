import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { teamPermissionAudit, teamRole } from "@/db/roles-schema";
import { user } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { builtInRoleKeys, builtInRoleNames, defaultRoleCapabilities, isTeamCapability, type TeamCapability } from "./capability-rules";

/**
 * Storage for team roles: seeding the built-in roles, saving a role's
 * capabilities, custom roles, custom role assignments, and the audit log.
 * Callers decide first with capability-rules.ts and role-admin-rules.ts.
 */

export type AuditAction = "role_created" | "role_updated" | "role_deleted" | "member_role_changed";

/** One audit row, as the Permissions tab lists it. */
export interface PermissionAuditView {
  id: string;
  action: AuditAction;
  subject: string;
  actorName: string | null;
  before: string[];
  after: string[];
  createdAt: string;
}

/** The audit row a change writes: who made it, what changed, and the values before and after. */
export interface AuditInput {
  actorId: string;
  action: AuditAction;
  subject: string;
  before: unknown;
  after: unknown;
}

/** The audit row's values, for the insert that ends each write below. */
function auditValues(teamId: string, audit: AuditInput) {
  return sql`${randomUUID()}, ${teamId}, ${audit.actorId}, ${audit.action}, ${audit.subject}, ${JSON.stringify(audit.before ?? null)}::jsonb, ${JSON.stringify(audit.after ?? null)}::jsonb`;
}

/** Throws when a write's closing audit insert returned no row, which means nothing was written. */
function requireRow<T>(rows: readonly T[], message: string): T {
  const [row] = rows;
  if (!row) throw new UserFacingError(message);
  return row;
}

/**
 * Inserts a role with its capabilities, and its audit row, in one statement,
 * so a role never exists without its audit row. Returns the role's id.
 */
async function insertRole(input: { teamId: string; key: string; name: string; builtIn: boolean; capabilities: readonly TeamCapability[]; audit: AuditInput | null }): Promise<string> {
  const logged = input.audit
    ? sql`, logged as (
        insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
        select ${auditValues(input.teamId, input.audit)} from role
      )`
    : sql``;
  const result = await getDb().execute<{ id: string }>(sql`
    with role as (
      insert into team_role (id, team_id, key, name, built_in)
      values (${randomUUID()}, ${input.teamId}, ${input.key}, ${input.name}, ${input.builtIn})
      on conflict (team_id, key) do nothing
      returning team_role.id
    ), caps as (
      insert into team_role_capability (role_id, capability)
      select role.id, unnest(${sql.param([...input.capabilities])}::text[]) from role
      on conflict do nothing
    )${logged}
    select role.id from role
  `);
  return requireRow(result.rows, "A role with that name already exists.").id;
}

/** Gives a new team its built-in roles with today's default capabilities. Safe to run again. */
export async function seedBuiltInRoles(teamId: string) {
  for (const key of builtInRoleKeys) {
    const [existing] = await getDb().select({ id: teamRole.id }).from(teamRole).where(and(eq(teamRole.teamId, teamId), eq(teamRole.key, key))).limit(1);
    if (!existing) await insertRole({ teamId, key, name: builtInRoleNames[key], builtIn: true, capabilities: defaultRoleCapabilities[key], audit: null });
  }
}

/**
 * Turns one capability of a role on or off, and writes its audit row, in
 * one statement. Only that capability changes, so two people editing
 * different cells of the same role never undo each other. A built-in role
 * with no stored row yet is stored first with `next`, its capabilities after
 * this change.
 */
export async function setRoleCapability(input: { teamId: string; key: string; name: string; builtIn: boolean; capability: TeamCapability; on: boolean; next: readonly TeamCapability[]; audit: AuditInput }): Promise<void> {
  const result = await getDb().execute<{ id: string }>(sql`
    with role as (
      insert into team_role (id, team_id, key, name, built_in)
      values (${randomUUID()}, ${input.teamId}, ${input.key}, ${input.name}, ${input.builtIn})
      on conflict (team_id, key) do update set updated_at = now()
      returning team_role.id, (xmax = 0) as created
    ), seeded as (
      insert into team_role_capability (role_id, capability)
      select role.id, unnest(${sql.param([...input.next])}::text[]) from role where role.created
      on conflict do nothing
    ), added as (
      insert into team_role_capability (role_id, capability)
      select role.id, ${input.capability} from role where not role.created and ${input.on}
      on conflict do nothing
    ), removed as (
      delete from team_role_capability using role
      where team_role_capability.role_id = role.id and team_role_capability.capability = ${input.capability} and not role.created and not ${input.on}
    )
    insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
    select ${auditValues(input.teamId, input.audit)} from role
    returning team_permission_audit.id
  `);
  requireRow(result.rows, "The role could not be saved.");
}

/** Creates a custom role, and its audit row, in one statement. Returns its id. */
export async function createCustomRole(input: { teamId: string; key: string; name: string; capabilities: readonly TeamCapability[]; audit: AuditInput }): Promise<string> {
  return insertRole({ ...input, builtIn: false });
}

/**
 * Deletes a custom role, and writes its audit row, in one statement; people
 * who had it go back to their built-in role. Built-in roles are never deleted.
 */
export async function deleteCustomRole(input: { teamId: string; key: string; audit: AuditInput }): Promise<void> {
  const result = await getDb().execute<{ id: string }>(sql`
    with gone as (
      delete from team_role
      where team_role.team_id = ${input.teamId} and team_role.key = ${input.key} and team_role.built_in = false
      returning team_role.id
    )
    insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
    select ${auditValues(input.teamId, input.audit)} from gone
    returning team_permission_audit.id
  `);
  requireRow(result.rows, "That role does not exist in this team.");
}

/**
 * Records a member's custom role, or clears it with a null `roleId`, and
 * writes the audit row, in one statement. The statement itself checks that
 * the member and the role both belong to `teamId`; otherwise nothing is
 * written and it throws.
 */
export async function recordMemberRole(input: { teamId: string; memberId: string; roleId: string | null; audit: AuditInput }): Promise<void> {
  const result = await getDb().execute<{ id: string }>(sql`
    with target as (
      select team_member.id as member_id from team_member
      where team_member.id = ${input.memberId} and team_member.team_id = ${input.teamId}
    ), granted as (
      select team_role.id as role_id from team_role
      where team_role.id = ${input.roleId} and team_role.team_id = ${input.teamId}
    ), cleared as (
      delete from team_role_assignment using target
      where team_role_assignment.member_id = target.member_id and ${input.roleId === null}
    ), assigned as (
      insert into team_role_assignment (member_id, role_id, assigned_by, assigned_at)
      select target.member_id, granted.role_id, ${input.audit.actorId}, now() from target, granted
      on conflict (member_id) do update set role_id = excluded.role_id, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at
      returning team_role_assignment.member_id
    )
    insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
    select ${auditValues(input.teamId, input.audit)} from target
    where ${input.roleId === null} or exists (select 1 from assigned)
    returning team_permission_audit.id
  `);
  requireRow(result.rows, "The role could not be changed.");
}

function capabilityList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && "role" in value && typeof value.role === "string") return [value.role];
  return [];
}

function isAuditAction(value: string): value is AuditAction {
  return value === "role_created" || value === "role_updated" || value === "role_deleted" || value === "member_role_changed";
}

/** The newest audit rows for a team. Callers must check the viewer is a member. */
export async function listPermissionAudit(teamId: string, limit = 50): Promise<PermissionAuditView[]> {
  const rows = await getDb()
    .select({ id: teamPermissionAudit.id, action: teamPermissionAudit.action, subject: teamPermissionAudit.subject, actorName: user.name, before: teamPermissionAudit.before, after: teamPermissionAudit.after, createdAt: teamPermissionAudit.createdAt })
    .from(teamPermissionAudit)
    .leftJoin(user, eq(user.id, teamPermissionAudit.actorId))
    .where(eq(teamPermissionAudit.teamId, teamId))
    .orderBy(desc(teamPermissionAudit.createdAt))
    .limit(limit);
  return rows.flatMap((row) => {
    if (!isAuditAction(row.action)) return [];
    return [{ ...row, action: row.action, before: capabilityList(row.before), after: capabilityList(row.after), createdAt: row.createdAt.toISOString() }];
  });
}

/** Capabilities from untrusted input, known names only, without repeats. */
export function cleanCapabilities(values: readonly unknown[]): TeamCapability[] {
  return [...new Set(values.filter(isTeamCapability))];
}
