import { DEFAULT_THEME_ID, themePresets, type ThemePreset } from "./presets";
import { parseTheme, type Theme } from "./schema";

/**
 * Picking the theme an artifact renders with. First match wins: the
 * artifact's own theme, then the team default, then the site default. Each
 * may be a preset id (a string) or custom theme JSON (an object). A value
 * that does not validate is skipped, so a bad theme never breaks a page.
 */

/** A theme ready to render, and where it came from. */
export interface ResolvedTheme {
  /** The preset id, or null for custom JSON. */
  presetId: string | null;
  source: "artifact" | "team" | "site";
  theme: Theme;
}

/** One built-in preset, validated once. */
export interface ParsedPreset extends Omit<ThemePreset, "theme"> {
  theme: Theme;
}

function parsePreset(preset: ThemePreset): ParsedPreset {
  const result = parseTheme(preset.theme);
  if (!result.ok) throw new Error(`Theme preset "${preset.id}" is invalid: ${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ")}`);
  return { ...preset, theme: result.theme };
}

let parsed: ReadonlyMap<string, ParsedPreset> | null = null;

/** Every built-in preset, validated, by id. Throws on first use if a preset is invalid, so a bad preset fails tests and the build. */
export function builtInPresets(): ReadonlyMap<string, ParsedPreset> {
  parsed ??= new Map(themePresets.map((preset) => [preset.id, parsePreset(preset)]));
  return parsed;
}

/** The validated built-in preset with this id, or undefined. */
export function presetTheme(id: string): Theme | undefined {
  return builtInPresets().get(id)?.theme;
}

/** The site default theme (the "default" preset). */
export function siteDefaultTheme(): Theme {
  const theme = presetTheme(DEFAULT_THEME_ID);
  if (!theme) throw new Error("The default theme preset is missing.");
  return theme;
}

function fromSource(value: unknown, extraPresets: ReadonlyMap<string, Theme> | undefined): { presetId: string | null; theme: Theme } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const theme = presetTheme(value) ?? extraPresets?.get(value);
    return theme ? { presetId: value, theme } : null;
  }
  const result = parseTheme(value);
  return result.ok ? { presetId: null, theme: result.theme } : null;
}

/**
 * The theme to render: the artifact's theme, else the team default, else the
 * site default. Each argument is a preset id, custom theme JSON, or
 * null/undefined. `extraPresets` lets callers add more ids (team presets).
 * Pass the result's `theme` to ThemeScope.
 */
export function resolveTheme(artifactTheme: unknown, teamDefault: unknown, extraPresets?: ReadonlyMap<string, Theme>): ResolvedTheme {
  const artifact = fromSource(artifactTheme, extraPresets);
  if (artifact) return { ...artifact, source: "artifact" };
  const team = fromSource(teamDefault, extraPresets);
  if (team) return { ...team, source: "team" };
  return { presetId: DEFAULT_THEME_ID, source: "site", theme: siteDefaultTheme() };
}
