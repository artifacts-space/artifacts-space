import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { teamPermissionAudit, teamRole, teamRoleAssignment } from "@/db/roles-schema";
import { user } from "@/db/schema";

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

/** Writes one audit row: who changed what, with the values before and after. */
export async function writePermissionAudit(input: { teamId: string; actorId: string; action: AuditAction; subject: string; before: unknown; after: unknown }) {
  await getDb().insert(teamPermissionAudit).values({ id: randomUUID(), ...input, before: input.before ?? null, after: input.after ?? null });
}

/** Inserts a role and its capabilities in one statement, or adds missing capabilities to an existing one. Returns its id. */
async function upsertRole(input: { teamId: string; key: string; name: string; builtIn: boolean; capabilities: readonly TeamCapability[] }): Promise<string> {
  const result = await getDb().execute<{ id: string }>(sql`
    with role as (
      insert into ${teamRole} (id, team_id, key, name, built_in)
      values (${randomUUID()}, ${input.teamId}, ${input.key}, ${input.name}, ${input.builtIn})
      on conflict (team_id, key) do update set updated_at = now()
      returning id
    ), caps as (
      insert into team_role_capability (role_id, capability)
      select role.id, unnest(${sql.param([...input.capabilities])}::text[]) from role
      on conflict do nothing
    )
    select id from role
  `);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("The role could not be saved.");
  return id;
}

/** Gives a new team its built-in roles with today's default capabilities. Safe to run again. */
export async function seedBuiltInRoles(teamId: string) {
  for (const key of builtInRoleKeys) {
    const [existing] = await getDb().select({ id: teamRole.id }).from(teamRole).where(and(eq(teamRole.teamId, teamId), eq(teamRole.key, key))).limit(1);
    if (!existing) await upsertRole({ teamId, key, name: builtInRoleNames[key], builtIn: true, capabilities: defaultRoleCapabilities[key] });
  }
}

/**
 * Replaces a role's capabilities in one statement: the role row is created
 * first when a built-in role has none yet. Returns the role's id.
 */
export async function saveRoleCapabilities(input: { teamId: string; key: string; name: string; builtIn: boolean; capabilities: readonly TeamCapability[] }): Promise<string> {
  const roleId = await upsertRole({ ...input, capabilities: [] });
  const capabilities = [...input.capabilities];
  await getDb().execute(sql`
    with removed as (
      delete from team_role_capability where role_id = ${roleId} and not (capability = any(${sql.param(capabilities)}::text[]))
    )
    insert into team_role_capability (role_id, capability)
    select ${roleId}, unnest(${sql.param(capabilities)}::text[])
    on conflict do nothing
  `);
  return roleId;
}

/** Creates a custom role. Returns its id. */
export async function createCustomRole(input: { teamId: string; key: string; name: string; capabilities: readonly TeamCapability[] }): Promise<string> {
  return upsertRole({ ...input, builtIn: false });
}

/** Deletes a custom role; people who had it go back to their built-in role. Built-in roles are never deleted. */
export async function deleteCustomRole(teamId: string, key: string) {
  await getDb().delete(teamRole).where(and(eq(teamRole.teamId, teamId), eq(teamRole.key, key), eq(teamRole.builtIn, false)));
}

/** Gives a member a custom role, or takes it away with null. The role must belong to the member's team. */
export async function setMemberCustomRole(input: { memberId: string; roleId: string | null; actorId: string }) {
  if (input.roleId === null) {
    await getDb().delete(teamRoleAssignment).where(eq(teamRoleAssignment.memberId, input.memberId));
    return;
  }
  await getDb()
    .insert(teamRoleAssignment)
    .values({ memberId: input.memberId, roleId: input.roleId, assignedBy: input.actorId })
    .onConflictDoUpdate({ target: teamRoleAssignment.memberId, set: { roleId: input.roleId, assignedBy: input.actorId, assignedAt: new Date() } });
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
