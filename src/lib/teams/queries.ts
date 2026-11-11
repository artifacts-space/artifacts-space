import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { teamRole, teamRoleAssignment } from "@/db/roles-schema";
import { agent, team, teamInvitation, teamMember, user } from "@/db/schema";

import { effectiveRoleKey, loadTeamRoles, resolveActor, type TeamRoleView } from "./capabilities";
import { builtInRoleNames, type ActorKind, type TeamActor, type TeamCapability } from "./capability-rules";
import { EXPIRED_INVITATION_DAYS } from "./invitation-rules";
import type { TeamHeadcount } from "./member-counts";
import { parseTeamRole, type TeamRole } from "./roles";
import { teamIconUrl } from "./team-icon-rules";

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
  /** The access-checked URL of the team's icon, or null when it has none. The storage key stays on the server. */
  iconUrl: string | null;
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
  logo: team.logo,
};

type MembershipRow = Omit<TeamMembership, "role" | "roleKey" | "roleName" | "kind" | "capabilities" | "iconUrl"> & { role: string; agentId: string | null; customKey: string | null; logo: string | null };

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
function toMembership({ agentId, customKey, logo, ...row }: MembershipRow, roles: ReadonlyMap<string, TeamRoleView> | undefined): TeamMembership {
  const role = parseTeamRole(row.role);
  const actor = resolveActor({ role, isAgent: agentId !== null, customKey }, roles);
  const iconUrl = row.personal ? null : teamIconUrl(row.id, logo);
  return { ...row, role, roleKey: actor.roleKey, roleName: actor.roleName, kind: actor.kind, capabilities: [...actor.capabilities], iconUrl };
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

/**
 * The query behind listTeamMembers: people in one team, with their custom
 * role in the same team. Agents are left out with a join and `is null`, not
 * a correlated subquery (AGENTS.md tripwire). Exported for its `.toSQL()` test.
 */
export function listTeamMembersQuery(db: Pick<ReturnType<typeof getDb>, "select">, teamId: string) {
  return db
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
    .leftJoin(agent, eq(agent.userId, teamMember.userId))
    .leftJoin(teamRoleAssignment, eq(teamRoleAssignment.memberId, teamMember.id))
    .leftJoin(assignedRole, and(eq(assignedRole.id, teamRoleAssignment.roleId), eq(assignedRole.teamId, teamMember.teamId)))
    .where(and(eq(teamMember.teamId, teamId), isNull(agent.userId)))
    .orderBy(asc(teamMember.createdAt));
}

/** People in a team (agents are listed separately). Callers must check the viewer's membership first. */
export async function listTeamMembers(teamId: string): Promise<TeamMemberView[]> {
  const rows = await listTeamMembersQuery(getDb(), teamId);
  return rows.map(({ customKey, customName, ...row }) => {
    const role = parseTeamRole(row.role);
    // The same rule as resolveActor, so the table always shows the role `can` uses.
    const roleKey = effectiveRoleKey({ role, isAgent: false, customKey });
    return { ...row, role, roleKey, roleName: roleKey === customKey && customName ? customName : builtInRoleNames[role], joinedAt: row.joinedAt.toISOString() };
  });
}

/** An invitation nobody answered: still open, or expired in the last EXPIRED_INVITATION_DAYS days. */
export interface PendingInvitationView {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: string;
  /** True once the link stopped working; the inviter can send a new one. */
  expired: boolean;
}

/**
 * Unanswered invitations for a team: open ones, then recently expired ones,
 * so the inviter can see an invitation ran out and send a new one. Callers
 * must check the viewer may invite people (`can(member, "members.invite")`).
 */
export async function listPendingInvitations(teamId: string, now = new Date()): Promise<PendingInvitationView[]> {
  const shownSince = new Date(now.getTime() - EXPIRED_INVITATION_DAYS * 86_400_000);
  const rows = await getDb()
    .select({ id: teamInvitation.id, email: teamInvitation.email, role: teamInvitation.role, expiresAt: teamInvitation.expiresAt })
    .from(teamInvitation)
    .where(and(eq(teamInvitation.teamId, teamId), eq(teamInvitation.status, "pending"), gt(teamInvitation.expiresAt, shownSince)))
    .orderBy(desc(teamInvitation.expiresAt));
  const views = rows.map((row) => ({ ...row, role: parseTeamRole(row.role), expiresAt: row.expiresAt.toISOString(), expired: row.expiresAt <= now }));
  return newestPerEmail(views);
}

/** Keeps one row per address, the newest: an expired invitation hides behind a newer one to the same person. */
function newestPerEmail(views: PendingInvitationView[]): PendingInvitationView[] {
  const seen = new Set<string>();
  return views.filter((view) => {
    const key = view.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The team an invitation belongs to, or null when there is no such invitation. */
export async function getInvitationTeamId(invitationId: string): Promise<string | null> {
  const [row] = await getDb().select({ teamId: teamInvitation.teamId }).from(teamInvitation).where(eq(teamInvitation.id, invitationId)).limit(1);
  return row?.teamId ?? null;
}

/** An invitation as the invited person sees it. */
export interface InvitationForInvitee {
  id: string;
  teamId: string;
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
  teamId: team.id,
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

function toInviteeView(row: { id: string; teamId: string; teamName: string; teamSlug: string; inviterId: string; inviterName: string; role: string | null; expiresAt: Date }) {
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
  /** The built-in role Better Auth stores on the membership row; Member under a custom role. */
  storedRole: TeamRole;
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
    const storedRole = parseTeamRole(row.role);
    return { userId: row.userId, name: row.name, memberId: row.memberId, isAgent, storedRole, actor: resolveActor({ role: storedRole, isAgent, customKey: row.customKey }, roles) };
  });
}
