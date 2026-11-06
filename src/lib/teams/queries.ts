import { and, asc, desc, eq, gt, inArray, notExists, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, team, teamInvitation, teamMember, user } from "@/db/schema";

import { parseTeamRole, type TeamRole } from "./roles";

/** A team as one member sees it. */
export interface TeamMembership {
  id: string;
  slug: string;
  name: string;
  personal: boolean;
  teamSharingNeedsApproval: boolean;
  createdBy: string | null;
  role: TeamRole;
  memberId: string;
}

const membershipColumns = {
  id: team.id,
  slug: team.slug,
  name: team.name,
  personal: team.personal,
  teamSharingNeedsApproval: team.teamSharingNeedsApproval,
  createdBy: team.createdBy,
  role: teamMember.role,
  memberId: teamMember.id,
};

type MembershipRow = Omit<TeamMembership, "role"> & { role: string };

function toMembership(row: MembershipRow): TeamMembership {
  return { ...row, role: parseTeamRole(row.role) };
}

function membershipQuery(userId: string) {
  return getDb()
    .select(membershipColumns)
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(eq(teamMember.userId, userId))
    .$dynamic();
}

/** Every team the user belongs to: the personal team first, then by name. */
export async function listTeamsForUser(userId: string): Promise<TeamMembership[]> {
  const rows = await membershipQuery(userId).orderBy(desc(team.personal), asc(team.name));
  return rows.map(toMembership);
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
  const [row] = await getDb()
    .select(membershipColumns)
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, userId), eq(team.slug, slug)))
    .limit(1);
  return row ? toMembership(row) : null;
}

/** Same as getTeamForMember, by team id. */
export async function getTeamMembershipById(userId: string, teamId: string): Promise<TeamMembership | null> {
  const [row] = await getDb()
    .select(membershipColumns)
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, userId), eq(team.id, teamId)))
    .limit(1);
  return row ? toMembership(row) : null;
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
  role: TeamRole;
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
      joinedAt: teamMember.createdAt,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(and(eq(teamMember.teamId, teamId), notExists(getDb().select({ id: agent.userId }).from(agent).where(eq(agent.userId, teamMember.userId)))))
    .orderBy(asc(teamMember.createdAt));
  return rows.map((row) => ({ ...row, role: parseTeamRole(row.role), joinedAt: row.joinedAt.toISOString() }));
}

/** An invitation that is still open. */
export interface PendingInvitationView {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: string;
}

/** Open invitations for a team. Callers must check the viewer is an owner or admin. */
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
  inviterName: string;
  role: TeamRole;
  expiresAt: string;
}

const inviteeColumns = {
  id: teamInvitation.id,
  teamName: team.name,
  teamSlug: team.slug,
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

function toInviteeView(row: { id: string; teamName: string; teamSlug: string; inviterName: string; role: string | null; expiresAt: Date }) {
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

/** How many members each of these teams has. */
export async function countMembers(teamIds: string[]): Promise<Map<string, number>> {
  if (teamIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ teamId: teamMember.teamId, count: sql<number>`count(*)::int` })
    .from(teamMember)
    .where(inArray(teamMember.teamId, teamIds))
    .groupBy(teamMember.teamId);
  return new Map(rows.map((row) => [row.teamId, row.count]));
}
