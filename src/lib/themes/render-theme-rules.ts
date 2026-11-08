import type { ArtifactVisibility } from "@/lib/artifact-types";

import type { StoredArtifactTheme } from "./artifact-theme";
import { resolveTheme } from "./resolve";

/**
 * True when the browser can work out the theme an artifact renders with on
 * its own, exactly as its page does: its own theme is a built-in preset or
 * theme JSON, or it is private with no theme (a private artifact never gets
 * a team default). Anything else (a team preset, or a shared artifact that
 * may inherit its team's default) needs the server, which knows the team.
 */
export function resolvesWithoutTeam(theme: StoredArtifactTheme | null, visibility: ArtifactVisibility): boolean {
  if (resolveTheme(theme, null).source === "artifact") return true;
  return theme === null && visibility === "private";
}
