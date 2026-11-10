import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { getDb } from "@/db";
import { teamRole, teamRoleAssignment, teamRoleCapability } from "@/db/roles-schema";
import { agent, team, teamMember } from "@/db/schema";

import { builtInRoleKeys, defaultRoleCapabilities, isAgentLockedCapability, type AgentLockedCapability } from "./capability-rules";

/*
 * `can(member, capability)` (capability-rules.ts) for one person in one
 * shared team, as SQL, so a write can repeat the check in its own WHERE
 * clause instead of trusting a read made a moment earlier. It follows the
 * same steps as the loader (queries.ts, capabilities.ts) and the rule:
 *
 * - it answers for people only: an agent member never matches, and a
 *   personal team never grants anything here. That equals can() only for
 *   capabilities agents can never hold (agentLockedCapabilities), so it
 *   accepts only those: for `analytics.view` it would wrongly refuse agents;
 * - the role that applies is a custom role assigned in the same team, else
 *   the highest built-in role Better Auth stores (parseTeamRole);
 * - owners hold every capability;
 * - otherwise the team's row for that role must list the capability, or,
 *   for a built-in role the team has no row for, today's defaults must.
 */

type Db = Pick<ReturnType<typeof getDb>, "select">;

const assignedRole = alias(teamRole, "assigned_role");
const heldRole = alias(teamRole, "held_role");
const heldCapability = alias(teamRoleCapability, "held_capability");

/** The built-in role Better Auth stores, read as parseTeamRole does: a comma-separated list where the highest known role wins. */
function storedRoleSql() {
  const has = (role: string) => sql`${teamMember.role} ~ ${`(^|,)\\s*${role}\\s*(,|$)`}`;
  return sql`case when ${has("owner")} then 'owner' when ${has("admin")} then 'admin' else 'member' end`;
}

/** The role that applies (effectiveRoleKey, for people): a custom role in the same team, else the stored built-in role. */
function roleKeySql() {
  const builtIns = sql.join(builtInRoleKeys.map((key) => sql`${key}`), sql`, `);
  return sql<string>`(case when ${assignedRole.key} is not null and ${assignedRole.key} not in (${builtIns}) then ${assignedRole.key} else ${storedRoleSql()} end)`;
}

/**
 * The team id, as a one-column select, when `userId` is a person (never an
 * agent) in the shared team `teamId` whose role holds `capability`; no row
 * otherwise. Only capabilities agents can never hold are accepted, and any
 * other throws, since excluding agents would refuse what can() allows them.
 * Joins only, every column qualified, and nothing correlated with an outer
 * query, so it is safe as an `in (...)` subquery in a single-table update
 * (see the tripwire in AGENTS.md). Exported for its `.toSQL()` test.
 */
export function capabilityHolderTeamQuery(db: Db, userId: string, teamId: string, capability: AgentLockedCapability) {
  // The type already says so; this guards callers that widen it.
  if (!isAgentLockedCapability(capability)) throw new Error(`capabilityHolderTeamQuery only checks capabilities agents can never hold, not ${String(capability)}`);
  const roleKey = roleKeySql();
  const defaultHolders = builtInRoleKeys.filter((key) => defaultRoleCapabilities[key].includes(capability));
  const holds = or(
    eq(roleKey, "owner"),
    isNotNull(heldCapability.roleId),
    and(isNull(heldRole.id), defaultHolders.length > 0 ? inArray(roleKey, defaultHolders) : sql`false`),
  );
  return db
    .select({ id: team.id })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
    .leftJoin(heldRole, and(eq(heldRole.teamId, teamMember.teamId), eq(heldRole.key, roleKey)))
    .leftJoin(heldCapability, and(eq(heldCapability.roleId, heldRole.id), eq(heldCapability.capability, capability)))
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId), eq(team.personal, false), isNull(agent.userId), holds));
}
