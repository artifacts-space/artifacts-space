import { and, asc, desc, eq, gt, inArray, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { teamRole, teamRoleAssignment } from "@/db/roles-schema";
import { agent, team, teamInvitation, teamMember, user } from "@/db/schema";

import { loadTeamRoles, resolveActor, type TeamRoleView } from "./capabilities";
import { builtInRoleNames, type ActorKind, type TeamActor, type TeamCapability } from "./capability-rules";
import type { TeamHeadcount } from "./member-counts";
import { parseTeamRole, type TeamRole } from "./roles";

/** A team as one member sees it. */
export interface TeamMembership {
  id: string;
  slug: string;
  name: string;
  personal: boolean;
  teamSharingNeedsApproval: boolean;
  createdBy: string | null;
  /** The built-in role Better Auth stores: owner, admin, or member. */
  role: TeamRole;
  memberId: string;
  /** The member's user id: a person, or an agent acting over MCP. */
  userId: string;
  /** The role that applies (capability-rules.ts): a built-in key, "agent", or a custom role's key. */
  roleKey: string;
  roleName: string;
  kind: ActorKind;
  capabilities: readonly TeamCapability[];
}

const assignedRole = alias(teamRole, "assigned_role");

const membershipColumns = {
  id: team.id,
  slug: team.slug,
  name: team.name,
  personal: team.personal,
  teamSharingNeedsApproval: team.teamSharingNeedsApproval,
  createdBy: team.createdBy,
  role: teamMember.role,
  memberId: teamMember.id,
  userId: teamMember.userId,
  agentId: agent.userId,
  customKey: assignedRole.key,
};

type MembershipRow = Omit<TeamMembership, "role" | "roleKey" | "roleName" | "kind" | "capabilities"> & { role: string; agentId: string | null; customKey: string | null };

/**
 * The user's membership rows joined to the team, the member's agent row
 * (agents act as the Agent role), and their custom role in the same team,
 * narrowed by `only` when given. The user filter is always part of the
 * WHERE clause, and the builder is not dynamic, so a caller cannot replace
 * it with a second `.where()`. Joins only, never correlated subqueries (see
 * AGENTS.md). Exported for its `.toSQL()` test.
 */
export function membershipQuery(db: Pick<ReturnType<typeof getDb>, "select">, userId: string, only?: SQL) {
  return db
    .select(membershipColumns)
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
    .where(and(eq(teamMember.userId, userId), only));
}

/** One membership with its role and capabilities, from its team's roles. */
function toMembership({ agentId, customKey, ...row }: MembershipRow, roles: ReadonlyMap<string, TeamRoleView> | undefined): TeamMembership {
  const role = parseTeamRole(row.role);
  const actor = resolveActor({ role, isAgent: agentId !== null, customKey }, roles);
  return { ...row, role, roleKey: actor.roleKey, roleName: actor.roleName, kind: actor.kind, capabilities: [...actor.capabilities] };
}

/** Fills in each membership's role and capabilities from its team's roles. */
async function toMemberships(rows: readonly MembershipRow[]): Promise<TeamMembership[]> {
  const roles = await loadTeamRoles([...new Set(rows.map((row) => row.id))]);
  return rows.map((row) => toMembership(row, roles.get(row.id)));
}

/** A membership together with every role of its team, so callers need no second role query. */
export interface TeamAccess {
  membership: TeamMembership;
  roles: ReadonlyMap<string, TeamRoleView>;
}

async function toAccess(rows: readonly MembershipRow[]): Promise<TeamAccess | null> {
  const [row] = rows;
  if (!row) return null;
  const roles = (await loadTeamRoles([row.id])).get(row.id) ?? new Map<string, TeamRoleView>();
  return { membership: toMembership(row, roles), roles };
}

/** Every team the user belongs to: the personal team first, then by name. */
export async function listTeamsForUser(userId: string): Promise<TeamMembership[]> {
  const rows = await membershipQuery(getDb(), userId).orderBy(desc(team.personal), asc(team.name));
  return toMemberships(rows);
}

/** The ids of every team the user belongs to. */
export async function listTeamIdsForUser(userId: string): Promise<Set<string>> {
  const rows = await getDb().select({ teamId: teamMember.teamId }).from(teamMember).where(eq(teamMember.userId, userId));
  return new Set(rows.map((row) => row.teamId));
}

/**
 * Looks up a team by slug for one user. Returns null when the team does not
 * exist or the user is not a member, so callers never reveal other teams.
 */
export async function getTeamForMember(userId: string, slug: string): Promise<TeamMembership | null> {
  const rows = await membershipQuery(getDb(), userId, eq(team.slug, slug)).limit(1);
  const [membership] = await toMemberships(rows);
  return membership ?? null;
}

/** Same as getTeamForMember, with the team's roles. */
export async function getTeamAccessForMember(userId: string, slug: string): Promise<TeamAccess | null> {
  return toAccess(await membershipQuery(getDb(), userId, eq(team.slug, slug)).limit(1));
}

/** Same as getTeamMembershipById, with the team's roles. */
export async function getTeamAccessById(userId: string, teamId: string): Promise<TeamAccess | null> {
  return toAccess(await membershipQuery(getDb(), userId, eq(team.id, teamId)).limit(1));
}

/** Same as getTeamForMember, by team id. */
export async function getTeamMembershipById(userId: string, teamId: string): Promise<TeamMembership | null> {
  const rows = await membershipQuery(getDb(), userId, eq(team.id, teamId)).limit(1);
  const [membership] = await toMemberships(rows);
  return membership ?? null;
}

/** The user's personal team, or null when it has not been created yet. */
export async function findPersonalTeam(userId: string) {
  const [row] = await getDb()
    .select({ id: team.id, slug: team.slug })
    .from(team)
    .where(and(eq(team.personal, true), eq(team.createdBy, userId)))
    .limit(1);
  return row ?? null;
}

/** A team member as the team page lists them. */
export interface TeamMemberView {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  /** The built-in role Better Auth stores. */
  role: TeamRole;
  /** The role that applies: the built-in role, or a custom role's key. */
  roleKey: string;
  roleName: string;
  joinedAt: string;
}

/** People in a team (agents are listed separately). Callers must check the viewer's membership first. */
export async function listTeamMembers(teamId: string): Promise<TeamMemberView[]> {
  const rows = await getDb()
    .select({
      memberId: teamMember.id,
      userId: teamMember.userId,
      name: user.name,
      email: user.email,
      username: user.username,
      role: teamMember.role,
      customKey: assignedRole.key,
      customName: assignedRole.name,
      joinedAt: teamMember.createdAt,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
    .where(and(eq(teamMember.teamId, teamId), notExists(getDb().select({ id: agent.userId }).from(agent).where(eq(agent.userId, teamMember.userId)))))
    .orderBy(asc(teamMember.createdAt));
  return rows.map(({ customKey, customName, ...row }) => {
    const role = parseTeamRole(row.role);
    return { ...row, role, roleKey: customKey ?? role, roleName: customName ?? builtInRoleNames[role], joinedAt: row.joinedAt.toISOString() };
  });
}

/** An invitation that is still open. */
export interface PendingInvitationView {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: string;
}

/** Open invitations for a team. Callers must check the viewer may invite people (`can(member, "members.invite")`). */
export async function listPendingInvitations(teamId: string): Promise<PendingInvitationView[]> {
  const rows = await getDb()
    .select({ id: teamInvitation.id, email: teamInvitation.email, role: teamInvitation.role, expiresAt: teamInvitation.expiresAt })
    .from(teamInvitation)
    .where(and(eq(teamInvitation.teamId, teamId), eq(teamInvitation.status, "pending"), gt(teamInvitation.expiresAt, new Date())))
    .orderBy(desc(teamInvitation.createdAt));
  return rows.map((row) => ({ ...row, role: parseTeamRole(row.role), expiresAt: row.expiresAt.toISOString() }));
}

/** An invitation as the invited person sees it. */
export interface InvitationForInvitee {
  id: string;
  teamName: string;
  teamSlug: string;
  /** Seeds the inviter's pixel avatar. Only people invite. */
  inviterId: string;
  inviterName: string;
  role: TeamRole;
  expiresAt: string;
}

const inviteeColumns = {
  id: teamInvitation.id,
  teamName: team.name,
  teamSlug: team.slug,
  inviterId: user.id,
  inviterName: user.name,
  role: teamInvitation.role,
  expiresAt: teamInvitation.expiresAt,
};

function inviteeCondition(email: string) {
  return and(
    sql`lower(${teamInvitation.email}) = ${email.toLowerCase()}`,
    eq(teamInvitation.status, "pending"),
    gt(teamInvitation.expiresAt, new Date()),
  );
}

function toInviteeView(row: { id: string; teamName: string; teamSlug: string; inviterId: string; inviterName: string; role: string | null; expiresAt: Date }) {
  return { ...row, role: parseTeamRole(row.role), expiresAt: row.expiresAt.toISOString() };
}

/** Open invitations addressed to an email address. */
export async function listInvitationsForEmail(email: string): Promise<InvitationForInvitee[]> {
  const rows = await getDb()
    .select(inviteeColumns)
    .from(teamInvitation)
    .innerJoin(team, eq(team.id, teamInvitation.teamId))
    .innerJoin(user, eq(user.id, teamInvitation.inviterId))
    .where(inviteeCondition(email))
    .orderBy(desc(teamInvitation.createdAt));
  return rows.map(toInviteeView);
}

/** One open invitation, only when it is addressed to this email address. */
export async function getInvitationForEmail(id: string, email: string): Promise<InvitationForInvitee | null> {
  const [row] = await getDb()
    .select(inviteeColumns)
    .from(teamInvitation)
    .innerJoin(team, eq(team.id, teamInvitation.teamId))
    .innerJoin(user, eq(user.id, teamInvitation.inviterId))
    .where(and(eq(teamInvitation.id, id), inviteeCondition(email)))
    .limit(1);
  return row ? toInviteeView(row) : null;
}

/**
 * How many people and agents each of these teams has. Agents hold team
 * member rows too, so they are split out here and never counted as people.
 */
export async function countMembers(teamIds: string[]): Promise<Map<string, TeamHeadcount>> {
  if (teamIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      teamId: teamMember.teamId,
      people: sql<number>`(count(*) filter (where ${agent.userId} is null))::int`,
      agents: sql<number>`count(${agent.userId})::int`,
    })
    .from(teamMember)
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .where(inArray(teamMember.teamId, teamIds))
    .groupBy(teamMember.teamId);
  return new Map(rows.map((row) => [row.teamId, { people: row.people, agents: row.agents }]));
}

/** A member of a team with the role that applies to them, for deciding who to notify. */
export interface TeamMemberActor {
  userId: string;
  name: string;
  memberId: string;
  isAgent: boolean;
  actor: TeamActor;
}

/** The query behind listTeamMemberActors: joins only, filtered by the team id. Exported for its `.toSQL()` test. */
export function listTeamMemberActorsQuery(db: Pick<ReturnType<typeof getDb>, "select">, teamId: string) {
  return db
    .select({ userId: teamMember.userId, name: user.name, memberId: teamMember.id, role: teamMember.role, agentId: agent.userId, customKey: assignedRole.key })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
    .where(eq(teamMember.teamId, teamId));
}

/**
 * Every member of one team, people and agents, with their roles resolved.
 * Pass the team's roles when they are already loaded. Callers decide with `can`.
 */
export async function listTeamMemberActors(teamId: string, knownRoles?: ReadonlyMap<string, TeamRoleView>): Promise<TeamMemberActor[]> {
  const [rows, roles] = await Promise.all([listTeamMemberActorsQuery(getDb(), teamId), knownRoles ?? loadTeamRoles([teamId]).then((byTeam) => byTeam.get(teamId))]);
  return rows.map((row) => {
    const isAgent = row.agentId !== null;
    return { userId: row.userId, name: row.name, memberId: row.memberId, isAgent, actor: resolveActor({ role: parseTeamRole(row.role), isAgent, customKey: row.customKey }, roles) };
  });
}
