import { getTeamMembershipById } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { loadArtifactThemeContext, type ThemeSubject } from "./artifact-theme-context";
import { isTeamPresetRef } from "./team-preset-rules";

/** The message when an artifact names a team preset it may not use. */
export function unusableTeamPresetMessage(ref: string): string {
  return `"${ref.slice(0, 64)}" is not a theme preset this artifact can use. It can use the built-in presets, and the presets of the team it is shared through (or, while it is private, of your teams). themes_list shows them.`;
}

/**
 * Refuses a team preset id the artifact cannot render with (another team's,
 * or a deleted one) or whose team the editor does not belong to, for the
 * web app and MCP alike. Anything that is not a team preset id passes;
 * parseArtifactThemeInput checks it.
 */
export async function assertTeamPresetUsable(editorId: string, subject: ThemeSubject, theme: unknown): Promise<void> {
  if (!isTeamPresetRef(theme)) return;
  const context = await loadArtifactThemeContext(subject, [theme]);
  const preset = context.presets.get(theme);
  const member = preset ? await getTeamMembershipById(editorId, preset.teamId) : null;
  if (!member) throw new UserFacingError(unusableTeamPresetMessage(theme));
}
