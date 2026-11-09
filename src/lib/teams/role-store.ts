import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { teamPermissionAudit } from "@/db/roles-schema";
import { user } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { builtInRoleKeys, builtInRoleNames, defaultRoleCapabilities, isBuiltInRoleKey, isTeamCapability, type TeamCapability } from "./capability-rules";
import type { TeamRole } from "./roles";

/**
 * Storage for team roles: seeding the built-in roles, saving a role's
 * capabilities, custom roles, custom role assignments, and the audit log.
 * Callers decide first with capability-rules.ts and role-admin-rules.ts.
 */

export type AuditAction = "role_created" | "role_updated" | "role_deleted" | "member_role_changed";

/** One audit row, as the Permissions tab lists it. `action` is one of AuditAction, or a newer action this code does not know yet. */
export interface PermissionAuditView {
  id: string;
  action: string;
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
  // A custom role can never take a built-in key; role resolution would ignore it anyway (effectiveRoleKey).
  if (!input.builtIn && isBuiltInRoleKey(input.key)) throw new UserFacingError("That name belongs to a built-in role.");
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

/**
 * Gives a new team its built-in roles with today's default capabilities, in
 * one statement, like the 0034 backfill. A role the team already has is
 * left as it is, with its capabilities, so running it again changes nothing.
 */
export async function seedBuiltInRoles(teamId: string) {
  const roles = sql.join(builtInRoleKeys.map((key) => sql`(${key}, ${builtInRoleNames[key]})`), sql`, `);
  const grants = sql.join(builtInRoleKeys.flatMap((key) => defaultRoleCapabilities[key].map((capability) => sql`(${key}, ${capability})`)), sql`, `);
  await getDb().execute(sql`
    with defaults (key, name) as (values ${roles}),
    grants (key, capability) as (values ${grants}),
    created as (
      insert into team_role (id, team_id, key, name, built_in)
      select gen_random_uuid()::text, ${teamId}, defaults.key, defaults.name, true from defaults
      on conflict (team_id, key) do nothing
      returning team_role.id, team_role.key
    )
    insert into team_role_capability (role_id, capability)
    select created.id, grants.capability from created join grants on grants.key = created.key
    on conflict do nothing
  `);
}

/**
 * Turns one capability of a role on or off, and writes its audit row when
 * that changed anything, in one statement. Only that capability changes, so
 * two people editing different cells of the same role never undo each other.
 * A built-in role with no stored row yet is stored first with `next`, its
 * capabilities after this change. A custom role is never created here: when
 * it is gone, nothing is written and this throws.
 */
export async function setRoleCapability(input: { teamId: string; key: string; name: string; builtIn: boolean; capability: TeamCapability; on: boolean; next: readonly TeamCapability[]; audit: AuditInput }): Promise<void> {
  const result = await getDb().execute<{ id: string }>(sql`
    -- "created" is true only for the row the inserted CTE returns, which
    -- exists only when there was no stored row before this statement. Only
    -- that role takes the whole list (seeded); an existing role only ever
    -- flips the one capability (added / removed). Never widen "seeded" to
    -- existing roles: a team that narrowed a built-in role would silently
    -- get the defaults back. When two first edits race, the second inserts
    -- nothing, finds no role, writes nothing, and throws.
    with existing as (
      select team_role.id from team_role
      where team_role.team_id = ${input.teamId} and team_role.key = ${input.key}
    ), inserted as (
      insert into team_role (id, team_id, key, name, built_in)
      select ${randomUUID()}, ${input.teamId}, ${input.key}, ${input.name}, true
      where ${input.builtIn} and not exists (select 1 from existing)
      on conflict (team_id, key) do nothing
      returning team_role.id
    ), role as (
      select existing.id, false as created from existing
      union all
      select inserted.id, true as created from inserted
    ), touched as (
      update team_role set updated_at = now() from existing where team_role.id = existing.id
    ), seeded as (
      insert into team_role_capability (role_id, capability)
      select role.id, unnest(${sql.param([...input.next])}::text[]) from role where role.created
      on conflict do nothing
    ), added as (
      insert into team_role_capability (role_id, capability)
      select role.id, ${input.capability} from role where not role.created and ${input.on}
      on conflict do nothing
      returning team_role_capability.role_id
    ), removed as (
      delete from team_role_capability using role
      where team_role_capability.role_id = role.id and team_role_capability.capability = ${input.capability} and not role.created and not ${input.on}
      returning team_role_capability.role_id
    ), logged as (
      -- Only a real change is logged: a repeated click on a cell already in that state writes nothing.
      insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
      select ${auditValues(input.teamId, input.audit)} from role
      where role.created or exists (select 1 from added) or exists (select 1 from removed)
    )
    select role.id from role
  `);
  requireRow(result.rows, "The role could not be saved.");
}

/** Creates a custom role, and its audit row, in one statement. Returns its id. */
export async function createCustomRole(input: { teamId: string; key: string; name: string; capabilities: readonly TeamCapability[]; audit: AuditInput }): Promise<string> {
  return insertRole({ ...input, builtIn: false });
}

/**
 * Deletes a custom role in one statement, with its audit row and a
 * member_role_changed row for each person who had it: they go back to their
 * built-in role, which is always Member under a custom role. Built-in roles
 * are never deleted.
 */
export async function deleteCustomRole(input: { teamId: string; key: string; audit: AuditInput }): Promise<void> {
  const result = await getDb().execute<{ id: string }>(sql`
    with holders as (
      select "user".name as name from team_role_assignment
      join team_role on team_role.id = team_role_assignment.role_id
      join team_member on team_member.id = team_role_assignment.member_id
      join "user" on "user".id = team_member.user_id
      where team_role.team_id = ${input.teamId} and team_role.key = ${input.key} and team_role.built_in = false
    ), gone as (
      delete from team_role
      where team_role.team_id = ${input.teamId} and team_role.key = ${input.key} and team_role.built_in = false
      returning team_role.id
    ), moved as (
      insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
      select gen_random_uuid()::text, ${input.teamId}, ${input.audit.actorId}, 'member_role_changed', holders.name,
        jsonb_build_object('role', ${input.audit.subject}::text), jsonb_build_object('role', ${builtInRoleNames.member}::text)
      from holders where exists (select 1 from gone)
    )
    insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
    select ${auditValues(input.teamId, input.audit)} from gone
    returning team_permission_audit.id
  `);
  requireRow(result.rows, "That role does not exist in this team.");
}

/**
 * Gives a member another role in one statement: the role stored on the
 * membership (`storedRole`, always owner, admin or member), the custom role
 * assignment (`roleId`, or null to clear it), and the audit row. Either all
 * of it lands or none of it, so there is nothing to repair: the last-owner
 * trigger, or a role from another team, stops the whole statement. When the
 * member already has exactly this role, nothing is written and no audit row
 * is added. Callers check who may give the role first
 * (role-admin-rules.ts, assignRoleProblem). Throws when the member or the
 * custom role is not in `teamId`. Returns whether anything changed.
 */
export async function changeMemberRole(input: { teamId: string; memberId: string; storedRole: TeamRole; roleId: string | null; audit: AuditInput }): Promise<{ changed: boolean }> {
  const result = await getDb().execute<{ found: boolean; changed: boolean }>(sql`
    with granted as (
      select team_role.id as role_id from team_role
      where team_role.id = ${input.roleId} and team_role.team_id = ${input.teamId} and team_role.built_in = false
    ), prior as (
      select team_member.id as member_id, team_member.role as stored_role, team_role_assignment.role_id as custom_role_id
      from team_member
      left join team_role_assignment on team_role_assignment.member_id = team_member.id
      where team_member.id = ${input.memberId} and team_member.team_id = ${input.teamId}
        and (${input.roleId === null} or exists (select 1 from granted))
    ), changed as (
      select prior.member_id from prior
      where prior.stored_role is distinct from ${input.storedRole} or prior.custom_role_id is distinct from ${input.roleId}
    ), stored as (
      update team_member set role = ${input.storedRole} from changed
      where team_member.id = changed.member_id
    ), cleared as (
      delete from team_role_assignment using changed
      where team_role_assignment.member_id = changed.member_id and ${input.roleId === null}
    ), assigned as (
      insert into team_role_assignment (member_id, role_id, assigned_by, assigned_at)
      select changed.member_id, granted.role_id, ${input.audit.actorId}, now() from changed, granted
      on conflict (member_id) do update set role_id = excluded.role_id, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at
    ), logged as (
      insert into team_permission_audit (id, team_id, actor_id, action, subject, before, after)
      select ${auditValues(input.teamId, input.audit)} from changed
      returning team_permission_audit.id
    )
    select exists (select 1 from prior) as found, exists (select 1 from logged) as changed
  `);
  const [row] = result.rows;
  if (!row?.found) throw new UserFacingError("The role could not be changed.");
  return { changed: row.changed };
}

function capabilityList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && "role" in value && typeof value.role === "string") return [value.role];
  return [];
}

/** The newest `limit` audit rows for a team, every action included. Callers must check the viewer is a member. */
export async function listPermissionAudit(teamId: string, limit = 50): Promise<PermissionAuditView[]> {
  const rows = await getDb()
    .select({ id: teamPermissionAudit.id, action: teamPermissionAudit.action, subject: teamPermissionAudit.subject, actorName: user.name, before: teamPermissionAudit.before, after: teamPermissionAudit.after, createdAt: teamPermissionAudit.createdAt })
    .from(teamPermissionAudit)
    .leftJoin(user, eq(user.id, teamPermissionAudit.actorId))
    .where(eq(teamPermissionAudit.teamId, teamId))
    .orderBy(desc(teamPermissionAudit.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, before: capabilityList(row.before), after: capabilityList(row.after), createdAt: row.createdAt.toISOString() }));
}

/** Capabilities from untrusted input, known names only, without repeats. */
export function cleanCapabilities(values: readonly unknown[]): TeamCapability[] {
  return [...new Set(values.filter(isTeamCapability))];
}
