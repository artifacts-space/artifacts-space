import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { teamRole, teamRoleCapability } from "@/db/roles-schema";

import {
  builtInRoleKeys,
  builtInRoleNames,
  defaultRoleCapabilities,
  isBuiltInRoleKey,
  isTeamCapability,
  type ActorKind,
  type TeamActor,
  type TeamCapability,
} from "./capability-rules";
import type { TeamRole } from "./roles";

/**
 * The thin database side of team permissions: which roles a team has and
 * what each may do. Decisions stay in capability-rules.ts (`can`), with a
 * SQL copy for write-time re-checks in capability-sql.ts.
 */

/** A role as the team page and the rule see it. */
export interface TeamRoleView {
  id: string | null;
  key: string;
  name: string;
  builtIn: boolean;
  capabilities: TeamCapability[];
}

type Db = Pick<ReturnType<typeof getDb>, "select">;

/** The query behind loadTeamRoles: roles joined to their capabilities, filtered by team id. Exported for its `.toSQL()` test. */
export function teamRolesQuery(db: Db, teamIds: readonly string[]) {
  return db
    .select({ id: teamRole.id, teamId: teamRole.teamId, key: teamRole.key, name: teamRole.name, builtIn: teamRole.builtIn, capability: teamRoleCapability.capability })
    .from(teamRole)
    .leftJoin(teamRoleCapability, eq(teamRoleCapability.roleId, teamRole.id))
    .where(inArray(teamRole.teamId, [...teamIds]));
}

type RoleRow = Awaited<ReturnType<typeof teamRolesQuery>>[number];

/**
 * Built-in roles a team has no row for keep today's rules, so a team made before its roles were seeded works as before.
 * capability-sql.ts repeats this fallback for write-time re-checks: change both together.
 */
function withBuiltIns(roles: Map<string, TeamRoleView>) {
  for (const key of builtInRoleKeys) {
    if (!roles.has(key)) roles.set(key, { id: null, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] });
  }
  return roles;
}

/** Groups role rows by team, dropping capability names this code does not know. */
export function groupRoleRows(rows: readonly RoleRow[], teamIds: readonly string[]): Map<string, Map<string, TeamRoleView>> {
  const byTeam = new Map<string, Map<string, TeamRoleView>>(teamIds.map((id) => [id, new Map()]));
  for (const row of rows) {
    const roles = byTeam.get(row.teamId) ?? new Map<string, TeamRoleView>();
    byTeam.set(row.teamId, roles);
    const role = roles.get(row.key) ?? { id: row.id, key: row.key, name: row.name, builtIn: row.builtIn, capabilities: [] };
    roles.set(row.key, role);
    if (isTeamCapability(row.capability)) role.capabilities.push(row.capability);
  }
  for (const roles of byTeam.values()) withBuiltIns(roles);
  return byTeam;
}

/** Every role of these teams with its capabilities, by team id and role key. */
export async function loadTeamRoles(teamIds: readonly string[]): Promise<Map<string, Map<string, TeamRoleView>>> {
  if (teamIds.length === 0) return new Map();
  const rows = await teamRolesQuery(getDb(), teamIds);
  return groupRoleRows(rows, teamIds);
}

/** What a membership row says about its role, before capabilities are known. */
export interface StoredRole {
  role: TeamRole;
  isAgent: boolean;
  customKey: string | null;
}

/**
 * The role that applies: Agent for agents, then a custom role, then the built-in role Better Auth stores.
 * capability-sql.ts repeats this choice for write-time re-checks: change both together.
 */
export function effectiveRoleKey(stored: StoredRole): string {
  if (stored.isAgent) return "agent";
  // A custom assignment never stands in for a built-in role: only Better Auth's own role makes an owner or admin.
  if (stored.customKey && !isBuiltInRoleKey(stored.customKey)) return stored.customKey;
  return stored.role;
}

/**
 * The actor for a member with this stored role in a team with these roles.
 * A custom role that no longer exists grants nothing (fail closed), and the
 * person is shown with their built-in role.
 */
export function resolveActor(stored: StoredRole, roles: ReadonlyMap<string, TeamRoleView> | undefined): TeamActor & { roleName: string } {
  const kind: ActorKind = stored.isAgent ? "agent" : "person";
  const key = effectiveRoleKey(stored);
  const role = roles?.get(key);
  if (!role) return { roleKey: key, kind, capabilities: [], roleName: builtInRoleNames[stored.role] };
  // A copy, so no caller can change the role shared by everyone in this request.
  return { roleKey: key, kind, capabilities: [...role.capabilities], roleName: role.name };
}
