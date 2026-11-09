import { assignableRoles, teamRoles, type AssignableRole, type TeamRole } from "./roles";

/**
 * Pure rules for the Members table: which rows the viewer may change, and
 * which roles they may pick. The server actions and Better Auth check the
 * same things again; these only decide what the table offers. Client-safe.
 */

/** The viewer and the row's member, as the Members table sees them. */
export interface MemberRowInput {
  canManage: boolean;
  viewerId: string;
  viewerRole: TeamRole;
  member: { userId: string; role: TeamRole };
  /** How many owners the team has. */
  ownerCount: number;
}

/**
 * Whether the viewer may change this member's role or remove them: owners
 * and admins, never on themselves, admins never on owners, and never on the
 * team's last owner, so a team always keeps one.
 */
export function canEditMemberRow(input: MemberRowInput): boolean {
  if (!input.canManage || input.member.userId === input.viewerId) return false;
  if (input.member.role !== "owner") return true;
  return input.viewerRole === "owner" && input.ownerCount > 1;
}

/** Roles the viewer may pick for another member. Only owners grant the owner role. */
export function rolesFor(viewerRole: TeamRole): readonly TeamRole[] {
  return viewerRole === "owner" ? teamRoles : teamRoles.filter((role) => role !== "owner");
}

/** The role to resend an invitation with, or null when it cannot be resent from the team page. */
export function resendableRole(role: TeamRole): AssignableRole | null {
  return assignableRoles.find((item) => item === role) ?? null;
}
