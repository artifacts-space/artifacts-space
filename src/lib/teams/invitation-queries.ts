import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { team, teamInvitation, teamMember, user } from "@/db/schema";

import { parseTeamRole, type TeamRole } from "./roles";

/** An invitation with its team and inviter, whatever its state. The page decides what the viewer may see (invitation-rules.ts). */
export interface InvitationRecord {
  id: string;
  email: string;
  status: string;
  expiresAt: Date;
  role: TeamRole;
  teamId: string;
  teamName: string;
  teamSlug: string;
  inviterId: string;
  inviterName: string;
}

/** One invitation by id, in any state, or null. Callers must not show its team to anyone it is not addressed to. */
export async function getInvitationRecord(id: string): Promise<InvitationRecord | null> {
  const [row] = await getDb()
    .select({
      id: teamInvitation.id,
      email: teamInvitation.email,
      status: teamInvitation.status,
      expiresAt: teamInvitation.expiresAt,
      role: teamInvitation.role,
      teamId: team.id,
      teamName: team.name,
      teamSlug: team.slug,
      inviterId: user.id,
      inviterName: user.name,
    })
    .from(teamInvitation)
    .innerJoin(team, eq(team.id, teamInvitation.teamId))
    .innerJoin(user, eq(user.id, teamInvitation.inviterId))
    .where(eq(teamInvitation.id, id))
    .limit(1);
  return row ? { ...row, role: parseTeamRole(row.role) } : null;
}

/** Whether a user is in a team. */
export async function isInTeam(userId: string, teamId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  return row !== undefined;
}

/**
 * The role of the open (pending, unexpired) invitation to `email` in a team,
 * or null when none is open: the same invitation Better Auth would resend.
 */
export async function openInvitationRole(teamId: string, email: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ role: teamInvitation.role })
    .from(teamInvitation)
    .where(and(
      eq(teamInvitation.teamId, teamId),
      sql`lower(${teamInvitation.email}) = ${email.toLowerCase()}`,
      eq(teamInvitation.status, "pending"),
      gt(teamInvitation.expiresAt, new Date()),
    ))
    .orderBy(desc(teamInvitation.createdAt))
    .limit(1);
  return row ? (row.role ?? "member") : null;
}
