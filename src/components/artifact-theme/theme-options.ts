import { themePresetSummaries, type StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { themeFont } from "@/lib/themes/fonts";
import { DEFAULT_THEME_ID } from "@/lib/themes/presets";
import { presetTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import type { ThemeChoices } from "@/lib/themes/theme-choice-types";

/** One swatch in the theme picker. */
export interface ThemeOption {
  /** Unique within the picker: "inherit", "custom", a built-in id, or a team preset id. */
  key: string;
  /** What choosing it stores: a preset id, or null for no theme of its own. Unused for "custom", which keeps the theme as it is. */
  value: string | null;
  name: string;
  /** The line under the name: the fonts, or the inherited preset's name. */
  detail: string;
  /** The accessible description: what the theme is for, which the swatch does not show. Its accessible name is what it shows: the name, then `detail`. */
  description: string;
  /** The tooltip on hover. */
  hint: string;
  theme: Theme;
  /** The heading shown above the first option of a group, when the picker has groups. */
  group: string | null;
}

/** A run of options under one heading, or the options before any heading (null). */
export interface ThemeOptionGroup {
  heading: string | null;
  /** The options in this run, with their place in the whole list (arrow keys move by it). */
  options: { option: ThemeOption; index: number }[];
}

const INHERIT_KEY = "inherit";
/** The key of the artifact's own theme JSON: shown as "Custom" with its swatch, and choosing it keeps it. */
export const CUSTOM_KEY = "custom";

function fontsLine(theme: Theme): string {
  const heading = themeFont(theme.fonts.heading)?.family ?? theme.fonts.heading;
  const body = themeFont(theme.fonts.body)?.family ?? theme.fonts.body;
  return heading === body ? body : `${heading} · ${body}`;
}

/**
 * The picker's options, in order: the artifact's custom theme (when it has
 * theme JSON of its own, such as one an agent set), the team default (when
 * the artifact inherits one), each team's presets, then the built-ins.
 * Without a team default, the built-in Default means "no theme of its own"
 * (null), as before; with one, it is stored as "default" so it overrides
 * the team's.
 */
export function themeOptions(choices: ThemeChoices, custom: Theme | null = null): ThemeOption[] {
  const grouped = choices.groups.length > 0 || choices.inherited !== null || custom !== null;
  const options: ThemeOption[] = [];
  if (custom) {
    const detail = fontsLine(custom);
    options.push({ key: CUSTOM_KEY, value: null, name: "Custom", detail, description: "This artifact's own theme", hint: "Custom: this artifact's own theme", theme: custom, group: "This artifact" });
  }
  if (choices.inherited) {
    const { name, theme } = choices.inherited;
    options.push({ key: INHERIT_KEY, value: null, name: "Team default", detail: name, description: "Set by the team", hint: `Team default: ${name}, set by the team`, theme, group: "Team default" });
  }
  for (const group of choices.groups) {
    group.presets.forEach((preset, index) => {
      const description = preset.description || "A team preset";
      const detail = fontsLine(preset.theme);
      options.push({ key: preset.ref, value: preset.ref, name: preset.name, detail, description, hint: `${preset.name}: ${description} (Team ${group.teamName})`, theme: preset.theme, group: index === 0 ? `Team · ${group.teamName}` : null });
    });
  }
  themePresetSummaries().forEach((preset, index) => {
    const theme = presetTheme(preset.id);
    if (!theme) return;
    const value = preset.id === DEFAULT_THEME_ID && !choices.inherited ? null : preset.id;
    const detail = fontsLine(theme);
    options.push({ key: preset.id, value, name: preset.name, detail, description: preset.description, hint: `${preset.name}: ${preset.description}`, theme, group: grouped && index === 0 ? "Built-in" : null });
  });
  return options;
}

/**
 * Splits the options into runs under their headings, in order: each option
 * with a `group` starts a run that lasts until the next one. Options before
 * the first heading (every option, when the picker has no groups) form one
 * run with a null heading.
 */
export function themeOptionGroups(options: readonly ThemeOption[]): ThemeOptionGroup[] {
  const groups: ThemeOptionGroup[] = [];
  options.forEach((option, index) => {
    const last = groups.at(-1);
    if (option.group !== null || !last) {
      groups.push({ heading: option.group, options: [{ option, index }] });
      return;
    }
    last.options.push({ option, index });
  });
  return groups;
}

/** The key of the option that shows as chosen: "custom" for theme JSON, and "missing" for a team preset not on offer. */
export function selectedOptionKey(value: StoredArtifactTheme | null, options: readonly ThemeOption[]): string {
  if (value === null) return options.some((option) => option.key === INHERIT_KEY) ? INHERIT_KEY : DEFAULT_THEME_ID;
  if (typeof value !== "string") return CUSTOM_KEY;
  return options.some((option) => option.key === value) ? value : "missing";
}

/** Team preset names by id, for labels outside the picker. */
export function teamPresetNames(choices: ThemeChoices): Map<string, string> {
  return new Map(choices.groups.flatMap((group) => group.presets.map((preset) => [preset.ref, preset.name] as const)));
}
