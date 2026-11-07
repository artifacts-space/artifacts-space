import type { ArtifactVisibility } from "@/lib/artifact-types";
import { sharingNeedsApproval, type SharingActor, type SharingTeamRule } from "@/lib/sharing/rules";
import { canManageTeam, type TeamRole } from "@/lib/teams/roles";
import { sameArtifactTheme, type StoredArtifactTheme } from "@/lib/themes/artifact-theme";

/**
 * Edit re-approval rules. Link and public artifacts keep an approved version
 * for readers outside the team. An edit becomes that version at once, or
 * waits for an owner or admin of the approving team. Team and private
 * artifacts have no approved version: every reader is inside the team.
 */

/** Levels whose readers outside the team see only approved versions. */
export function isReviewedLevel(visibility: ArtifactVisibility): visibility is "link" | "public" {
  return visibility === "link" || visibility === "public";
}

export type EditOutcome = "apply" | "pending";

/**
 * Whether an edit of an artifact shared at `visibility` through `team` goes
 * live now or waits. It applies when the level is not reviewed, when there
 * is no approving team, when the team approves itself (a personal team), or
 * when a person who can approve makes it. Agents always wait where approval
 * is needed, because agents never approve.
 */
export function decideEdit(input: {
  visibility: ArtifactVisibility;
  team: SharingTeamRule | null;
  role: TeamRole | null;
  actor: SharingActor;
}): EditOutcome {
  if (!isReviewedLevel(input.visibility) || !input.team) return "apply";
  if (!sharingNeedsApproval(input.visibility, input.team)) return "apply";
  if (input.actor === "person" && input.role !== null && canManageTeam(input.role)) return "apply";
  return "pending";
}

/** Whether an applied edit needs an audit row: an approver approved their own edit. */
export function editNeedsAuditRow(input: { visibility: ArtifactVisibility; team: SharingTeamRule | null }): boolean {
  return isReviewedLevel(input.visibility) && input.team !== null && sharingNeedsApproval(input.visibility, input.team);
}

/** Which version a viewer reads. */
export type ServedVersion = { source: "latest" } | { source: "approved"; versionId: string };

/**
 * The author and members of the artifact's team read the latest version.
 * Everyone else reads the approved version of a link or public artifact.
 * Without an approved version (older rows), everyone reads the latest.
 */
export function versionToServe(input: {
  visibility: ArtifactVisibility;
  approvedVersionId: string | null;
  isAuthor: boolean;
  isTeamMember: boolean;
}): ServedVersion {
  if (input.isAuthor || input.isTeamMember) return { source: "latest" };
  if (!isReviewedLevel(input.visibility) || input.approvedVersionId === null) return { source: "latest" };
  return { source: "approved", versionId: input.approvedVersionId };
}

/** The fields readers see, and so the fields an edit review compares. */
export interface ReviewedFields {
  title: string;
  icon: string | null;
  theme: StoredArtifactTheme | null;
  summary: string;
  content: string;
  kind: string;
  language: string;
  project: string;
  source: string;
  metadata: Record<string, unknown>;
}

const reviewedKeys = ["title", "icon", "summary", "content", "kind", "language", "project", "source"] as const;

/** True when two versions show readers the same thing. */
export function sameReviewedFields(a: ReviewedFields, b: ReviewedFields): boolean {
  if (reviewedKeys.some((key) => a[key] !== b[key])) return false;
  if (!sameArtifactTheme(a.theme, b.theme)) return false;
  return JSON.stringify(a.metadata) === JSON.stringify(b.metadata);
}
