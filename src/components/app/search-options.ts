import type { ArtifactVisibility } from "@/lib/artifact-types";
import { decideSharing } from "@/lib/sharing/rules";

import type { ShareTeam } from "./share-teams-context";

/**
 * The "Show in search engines" switch in the Share dialog: hidden unless the
 * person chose Public; usable when the artifact is public already or will be
 * as soon as they save; otherwise it waits until the public sharing is
 * approved (the server only turns it on for public artifacts).
 */
export type SearchSwitchState = "hidden" | "available" | "after-approval";

/** Which state the switch is in for this choice. */
export function searchSwitchState(input: { current: ArtifactVisibility; visibility: ArtifactVisibility; team: ShareTeam | undefined }): SearchSwitchState {
  if (input.visibility !== "public") return "hidden";
  if (input.current === "public") return "available";
  // No team to approve it yet: the dialog asks for one first, and Save waits.
  if (!input.team) return "hidden";
  return decideSharing({ level: "public", team: input.team, role: input.team.role, actor: "person" }) === "apply" ? "available" : "after-approval";
}

/**
 * Whether saving should also change the setting: the switch was usable,
 * the artifact is public after the sharing change, and the choice differs.
 */
export function searchChangeAfterSave(input: { state: SearchSwitchState; savedVisibility: ArtifactVisibility; saved: boolean; chosen: boolean }): boolean {
  return input.state === "available" && input.savedVisibility === "public" && input.saved !== input.chosen;
}
