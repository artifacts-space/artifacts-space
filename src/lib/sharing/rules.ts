import type { SharingLevel } from "@/lib/artifact-types";
import { canManageTeam, type TeamRole } from "@/lib/teams/roles";

/** The team settings that decide whether sharing needs approval. */
export interface SharingTeamRule {
  personal: boolean;
  teamSharingNeedsApproval: boolean;
}

/** Who asks. Agents (MCP tokens) can request sharing but never approve it. */
export type SharingActor = "person" | "agent";

/**
 * Whether sharing at this level, in this team, needs an owner's or admin's
 * approval. Personal teams approve themselves. In shared teams, link and
 * public sharing always need approval; team sharing follows the team's rule.
 */
export function sharingNeedsApproval(level: SharingLevel, team: SharingTeamRule): boolean {
  if (team.personal) return false;
  if (level === "team") return team.teamSharingNeedsApproval;
  return true;
}

export type SharingOutcome = "apply" | "pending";

/**
 * Applies at once when no approval is needed, or when a person who could
 * approve it asks (an owner or admin in the web app). Agents always wait.
 */
export function decideSharing(input: { level: SharingLevel; team: SharingTeamRule; role: TeamRole; actor: SharingActor }): SharingOutcome {
  if (!sharingNeedsApproval(input.level, input.team)) return "apply";
  if (input.actor === "person" && canManageTeam(input.role)) return "apply";
  return "pending";
}

/** Team sharing with a personal team would reach nobody, so it is refused. */
export function isLevelAllowedInTeam(level: SharingLevel, team: SharingTeamRule): boolean {
  return !(level === "team" && team.personal);
}

/** The author, or an owner or admin of the artifact's team, may make it private again. */
export function canWithdrawSharing(input: { viewerId: string; authorId: string; viewerRole: TeamRole | null }): boolean {
  if (input.viewerId === input.authorId) return true;
  return input.viewerRole !== null && canManageTeam(input.viewerRole);
}

/** Owners and admins of the request's team decide; agents never do. */
export function canDecideRequest(input: { viewerRole: TeamRole | null; actor: SharingActor }): boolean {
  return input.actor === "person" && input.viewerRole !== null && canManageTeam(input.viewerRole);
}
