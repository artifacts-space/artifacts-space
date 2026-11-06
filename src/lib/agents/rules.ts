import { canManageTeam, type TeamRole } from "@/lib/teams/roles";

/** Owners and admins of a shared (not personal) team manage its agents. */
export function canManageAgents(membership: { role: TeamRole; personal: boolean } | null): boolean {
  return membership !== null && !membership.personal && canManageTeam(membership.role);
}
