import type { SharingLevel } from "@/lib/artifact-types";
import { actingAs, can, type TeamActor, type TeamCapability } from "@/lib/teams/capability-rules";

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

/** The capability that lets a member share at a level without asking first. */
export const shareCapability: Record<SharingLevel, TeamCapability> = { team: "share.team", link: "share.link", public: "share.public" };

/**
 * Applies at once when no approval is needed, or when the member holds the
 * level's share capability (owners and admins by default). Agents always
 * wait, because sharing at once would approve their own request.
 */
export function decideSharing(input: { level: SharingLevel; team: SharingTeamRule; member: TeamActor | null; actor: SharingActor }): SharingOutcome {
  if (!sharingNeedsApproval(input.level, input.team)) return "apply";
  if (can(actingAs(input.member, input.actor), shareCapability[input.level])) return "apply";
  return "pending";
}

/** Team sharing with a personal team would reach nobody, so it is refused. */
export function isLevelAllowedInTeam(level: SharingLevel, team: SharingTeamRule): boolean {
  return !(level === "team" && team.personal);
}

/** The author, or a member of the artifact's team who may withdraw others' sharing, may make it private again. */
export function canWithdrawSharing(input: { viewerId: string; authorId: string; member: TeamActor | null }): boolean {
  if (input.viewerId === input.authorId) return true;
  return can(input.member, "artifacts.withdraw");
}

/** Members of the request's team who may approve that kind of request decide; agents never do. */
export function canDecideRequest(input: { member: TeamActor | null; actor: SharingActor; kind: "sharing" | "comments" | "edit" }): boolean {
  return can(actingAs(input.member, input.actor), input.kind === "edit" ? "approve.edits" : "approve.sharing");
}

/**
 * Whether an open sharing or comments request may still be approved: the
 * artifact's author is still in the request's team (artifacts shared through
 * a team belong to a member, src/lib/sharing/transfer.ts), and the person who
 * asked is the author or still acts for the agent that wrote it.
 */
export function requestStillValid(input: { authorId: string; requestedBy: string; requesterActsForAuthor: boolean; authorInTeam: boolean }): boolean {
  if (!input.authorInTeam) return false;
  return input.requestedBy === input.authorId || input.requesterActsForAuthor;
}

/**
 * The team a sharing change goes to when the person who added an agent
 * shares the agent's artifact: the agent's own team, since an artifact shared
 * through a team must belong to one of its members. Returns the error to show
 * when the chosen team does not include the agent, or null when it does.
 */
export function agentArtifactTeamProblem(input: { authorInTeam: boolean }): string | null {
  if (input.authorInTeam) return null;
  return "An agent wrote this artifact, so share it with the agent's team, or by link or public through that team.";
}
