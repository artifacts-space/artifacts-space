import type { ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";
import { commentsAfterSharing, decideCommentSetting } from "@/lib/comments/setting-rules";

import type { ShareTeam } from "./share-teams-context";

/**
 * Words and previews for the comments setting in the Share dialog and the
 * team page. The server applies the same rules (src/lib/comments/setting-rules.ts).
 */

/** Whether "team" means a shared team, or only the author (no team, or a personal one). */
function onlyAuthor(visibility: ArtifactVisibility, team: Pick<ShareTeam, "personal"> | undefined) {
  return visibility === "private" || !team || team.personal;
}

/** The options to pick from, worded for the level and team. */
export function commentOptions(visibility: ArtifactVisibility, team: Pick<ShareTeam, "personal"> | undefined): { value: CommentSetting; title: string }[] {
  return [
    { value: "off", title: "Off" },
    { value: "team", title: onlyAuthor(visibility, team) ? "Only you" : "Team members" },
    { value: "signed_in", title: "Anyone signed in" },
  ];
}

/** Short label for a setting, for lists and the closed picker. */
export function commentLabel(setting: CommentSetting, personal = false): string {
  if (setting === "off") return "Off";
  if (setting === "team") return personal ? "Only you" : "Team members";
  return "Anyone signed in";
}

/** One sentence on what the chosen setting does. */
export function commentDetail(setting: CommentSetting): string {
  if (setting === "off") return "No one sees or writes comments. Existing comments stay hidden until you turn comments back on.";
  if (setting === "team") return "Readers outside the team see no comments.";
  return "Anyone signed in who can read it can comment.";
}

/** The setting the dialog shows after the person picks a level and team, until they pick one themselves. */
export function previewComments(input: { current: CommentSetting; currentTeamId: string | null; visibility: ArtifactVisibility; team: ShareTeam | undefined }): CommentSetting {
  const teamId = input.visibility === "private" ? null : input.team?.id ?? null;
  return commentsAfterSharing({
    current: input.current,
    requested: undefined,
    sameTeam: input.visibility === "private" || teamId === input.currentTeamId,
    next: { visibility: input.visibility, teamPersonal: input.team?.personal ?? null },
  });
}

/** Whether saving this setting waits for an owner or admin, so the dialog can say so. */
export function commentsWaitForApproval(input: { current: CommentSetting; next: CommentSetting; currentTeamId: string | null; visibility: ArtifactVisibility; team: ShareTeam | undefined }): boolean {
  if (input.visibility === "private" || !input.team) return false;
  const sameTeam = input.team.id === input.currentTeamId;
  return decideCommentSetting({ current: input.current, next: input.next, sameTeam, team: input.team, member: input.team, actor: "person" }) === "pending";
}
