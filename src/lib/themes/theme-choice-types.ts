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

/** Everything the picker needs beyond the built-ins. */
export interface ThemeChoices {
  groups: ThemeChoiceGroup[];
  /** The team default an artifact with no theme of its own shows, or null when it shows the site default. */
  inherited: { name: string; theme: Theme } | null;
}

/** No team presets and no team default. */
export const noThemeChoices: ThemeChoices = { groups: [], inherited: null };
