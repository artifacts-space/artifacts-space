import type { Theme } from "./schema";

/**
 * What the artifact theme picker offers beyond the built-ins (loaded by
 * theme-choices.ts on the server). Kept free of server code so client
 * components can import it.
 */

/** One team preset in a picker. */
export interface ThemeChoicePreset {
  ref: string;
  name: string;
  description: string;
  theme: Theme;
}

/** A team's presets in a picker. */
export interface ThemeChoiceGroup {
  teamId: string;
  teamName: string;
  presets: ThemeChoicePreset[];
}

/** A team whose presets the viewer manages (owner or admin), where this artifact could use a new preset. */
export interface ThemeChoiceTeam {
  teamId: string;
  teamName: string;
}

/** Everything the picker needs beyond the built-ins. */
export interface ThemeChoices {
  groups: ThemeChoiceGroup[];
  /** The team default an artifact with no theme of its own shows, or null when it shows the site default. */
  inherited: { name: string; theme: Theme } | null;
  /** Teams the viewer may save the artifact's custom theme to as a preset ("Save as team preset"). Empty for everyone else. */
  manageable: ThemeChoiceTeam[];
}

/** No team presets, no team default, and nowhere to save a preset. */
export const noThemeChoices: ThemeChoices = { groups: [], inherited: null, manageable: [] };
