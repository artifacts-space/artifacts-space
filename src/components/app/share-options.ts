import type { ArtifactVisibility } from "@/lib/artifact-types";
import { decideSharing } from "@/lib/sharing/rules";

import type { ShareTeam } from "./share-teams-context";

export const visibilityOptions: { value: ArtifactVisibility; title: string; detail: string }[] = [
  { value: "private", title: "Private", detail: "Only you." },
  { value: "team", title: "Team", detail: "Signed-in members of a team." },
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

/** What will happen when the viewer saves this choice, in one sentence. */
export function outcomeText(visibility: ArtifactVisibility, team: ShareTeam | undefined) {
  if (visibility === "private") return "Only you can read it. Any open request is canceled.";
  if (!team) return visibility === "team" ? "Join or create a team to share with one." : "Choose a team.";
  const outcome = decideSharing({ level: visibility, team, member: team, actor: "person" });
  if (outcome === "apply") return "It applies as soon as you save.";
  return `Someone in ${team.name} who approves sharing approves it first. Until then, it stays as it is.`;
}
