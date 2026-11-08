import type { StoredArtifactTheme } from "./artifact-theme";
import { isTeamPresetRef, type NamedResolvedTheme } from "./team-preset-rules";

/**
 * Team preset names and ids are the team's own words ("Acme Q3 launch",
 * "team:acme-q3-launch-x7k2p9"), so, like projects and tags, only the
 * author and members of the team the artifact is shared through see them:
 * the readers who may edit it (`canEdit`). Every other reader, signed-out
 * readers of link and public pages included, sees a team preset as
 * "Custom" and is never told about a team default. Built-in preset names
 * are the site's, so everyone sees them.
 */

/** What readers outside the team see in place of a team preset's name or id. */
export const OUTSIDER_TEAM_THEME_LABEL = "Custom";
const OUTSIDER_TEAM_THEME_ID = "custom";

/**
 * The Markdown "- Theme:" value; null for the site default. Insiders get
 * the theme's name, marked when it is the team default. Outsiders get a
 * built-in's name, or "Custom" for a team preset, and never "team default".
 */
export function markdownThemeLabel(resolved: NamedResolvedTheme, insider: boolean): string | null {
  if (resolved.source === "site") return null;
  if (insider) return resolved.source === "team" ? `${resolved.name} (team default)` : resolved.name;
  return resolved.presetId === null || isTeamPresetRef(resolved.presetId) ? OUTSIDER_TEAM_THEME_LABEL : resolved.name;
}

/** The theme id the page names in its HTML (`data-artifact-theme`): the preset id, or "custom" for theme JSON and, for outsiders, for a team preset. */
export function themeIdForReader(presetId: string | null, insider: boolean): string {
  if (presetId === null) return OUTSIDER_TEAM_THEME_ID;
  return !insider && isTeamPresetRef(presetId) ? OUTSIDER_TEAM_THEME_ID : presetId;
}

/** An artifact's stored theme as a reader may get it (MCP and the workspace): outsiders get "custom" in place of a team preset id. */
export function storedThemeForReader(theme: StoredArtifactTheme | null, insider: boolean): StoredArtifactTheme | null {
  return !insider && isTeamPresetRef(theme) ? OUTSIDER_TEAM_THEME_ID : theme;
}
