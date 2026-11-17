import type { ArtifactVisibility, ShareableArtifactDto } from "@/lib/artifact-types";
import { decideSharing, type SharingOutcome } from "@/lib/sharing/rules";

import type { ShareTeam } from "./share-teams-context";

export const visibilityOptions: { value: ArtifactVisibility; title: string; detail: string }[] = [
  { value: "private", title: "Private", detail: "Only you." },
  { value: "team", title: "Team", detail: "Members of a team. It moves to the team's workspace." },
  { value: "link", title: "Link", detail: "Anyone with the link." },
  { value: "public", title: "Public", detail: "Anyone who has or finds the link." },
];

/** Short label for a visibility, for buttons and lists. */
export function visibilityLabel(visibility: ArtifactVisibility) {
  return visibilityOptions.find((option) => option.value === visibility)?.title ?? visibility;
}

/** Teams that can carry this level: shared teams for team sharing; any team approves link or public. */
export function teamsFor(visibility: ArtifactVisibility, teams: readonly ShareTeam[]) {
  if (visibility === "private") return [];
  if (visibility === "team") return teams.filter((team) => !team.personal);
  return [...teams];
}

/** How a team reads in the picker: a personal team says so. */
export function teamLabel(team: ShareTeam) {
  return team.personal ? `${team.name} (personal)` : team.name;
}

/** The closed picker's label for the chosen team id, so it never shows the raw id. */
export function selectedTeamLabel(id: string | null, teams: readonly ShareTeam[]) {
  const team = teams.find((item) => item.id === id);
  return team ? teamLabel(team) : "Choose a team";
}

/** The team picked by default: the artifact's current team when it fits, else the first that does. */
export function defaultTeamId(visibility: ArtifactVisibility, teams: readonly ShareTeam[], currentTeamId: string | null) {
  const options = teamsFor(visibility, teams);
  return options.find((team) => team.id === currentTeamId)?.id ?? options[0]?.id ?? null;
}

/**
 * The shared team whose rule the Share dialog states: the team the choice
 * puts the artifact in, whether it is already there or is moving in now (the
 * moment the person decides). Null while the choice keeps it personal:
 * private, or a link or public level approved by the viewer's personal team.
 */
export function ruleTeamFor(visibility: ArtifactVisibility, team: ShareTeam | undefined): ShareTeam | null {
  if (visibility === "private" || !team || team.personal) return null;
  return team;
}

/** Whether saving this choice applies at once or waits for an approval, by the team's rule and the viewer's role. Private always applies. */
export function choiceOutcome(visibility: ArtifactVisibility, team: ShareTeam | undefined): SharingOutcome {
  if (visibility === "private" || !team) return "apply";
  return decideSharing({ level: visibility, team, member: team, actor: "person" });
}

/** What will happen when the viewer saves this choice, in one sentence. */
export function outcomeText(visibility: ArtifactVisibility, team: ShareTeam | undefined) {
  if (visibility === "private") return "Only you can read it. Any open request is canceled.";
  if (!team) return visibility === "team" ? "Join or create a team to move it to one." : "Choose a team.";
  if (choiceOutcome(visibility, team) === "apply") return "It applies as soon as you save.";
  return `Someone in ${team.name} who approves sharing approves it first. Until then, it stays as it is.`;
}

/**
 * Whether Undo can put an artifact's sharing back at once: making it private
 * always can; sharing it again can only where that needs no approval, since
 * an Undo that files a request would undo nothing.
 */
export function undoApplies(before: { visibility: ArtifactVisibility; teamId: string | null }, teams: readonly ShareTeam[]): boolean {
  if (before.visibility === "private") return true;
  const team = teams.find((item) => item.id === before.teamId);
  return team !== undefined && choiceOutcome(before.visibility, team) === "apply";
}

/**
 * What the Share dialog's picks start from: the artifact, who can read it,
 * its team, comments, search engines, and its open requests. When any of
 * these changes (a save, the page refreshing after one, an approval or a
 * withdrawal elsewhere), the dialog starts again from what the server
 * stored, so it never shows or re-sends picks that did not apply.
 */
export function shareChoiceBasis(artifact: ShareableArtifactDto): string {
  const { id, visibility, teamId, comments, showInSearch, pendingSharing, pendingComments } = artifact;
  return JSON.stringify([id, visibility, teamId, comments, showInSearch, pendingSharing?.requestId ?? null, pendingComments?.requestId ?? null]);
}
