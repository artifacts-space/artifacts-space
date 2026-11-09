import type { TeamActor } from "./capability-rules";
import { assignRoleProblem, removeMemberProblem, type RoleGrant } from "./role-admin-rules";
import { assignableRoles, type AssignableRole, type TeamRole } from "./roles";

/**
 * Pure rules for the Members table: which roles the viewer may pick for each
 * person, and whether they may remove them. They ask the same rules the
 * server actions ask (role-admin-rules.ts); the server checks again.
 * Client-safe.
 */

/** A team role the table can offer. */
export interface RoleOption extends RoleGrant {
  name: string;
}

/** The viewer and one person row, as the Members table sees them. */
export interface MemberRowInput {
  viewer: TeamActor & { userId: string; personal: boolean };
  member: { userId: string; roleKey: string };
  /** Every role in the team, built-in and custom. */
  roles: readonly RoleOption[];
  /** How many owners the team has. */
  ownerCount: number;
}

/** What the viewer may do to one person: the roles they may give (the current one first) and whether they may remove them. */
export function memberRowControls(input: MemberRowInput): { roleOptions: RoleOption[]; canRemove: boolean } {
  const current = input.roles.find((role) => role.key === input.member.roleKey);
  if (input.viewer.personal || !current) return { roleOptions: [], canRemove: false };
  const target = { roleKey: current.key, capabilities: current.capabilities, isAgent: false, isSelf: input.member.userId === input.viewer.userId };
  const others = input.roles.filter((role) => role.key !== current.key && assignRoleProblem(input.viewer, target, role, input.ownerCount) === null);
  return {
    roleOptions: others.length > 0 ? [current, ...others] : [],
    canRemove: removeMemberProblem(input.viewer, target, input.ownerCount) === null,
  };
}

/** The role to resend an invitation with, or null when it cannot be resent from the team page. */
export function resendableRole(role: TeamRole): AssignableRole | null {
  return assignableRoles.find((item) => item === role) ?? null;
}
