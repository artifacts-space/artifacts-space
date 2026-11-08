import type { ContrastChange } from "./contrast";
import { themeColorKeys, type Theme, type ThemeColorKey, type ThemeIssue } from "./schema";

/**
 * The team preset editor's working copy. Every value is plain text while
 * someone types, so a half-typed color or an unknown font stays visible
 * with its error instead of disappearing. parseTheme checks the draft as
 * is; nothing here decides what is valid.
 */

/** One palette in the editor. */
export type DraftPalette = Record<ThemeColorKey, string> & { chart: string[] };

/** A theme in the editor: Theme's shape, with every value as entered. */
export interface ThemeDraft {
  version: 1;
  mode: string;
  radius: string;
  fonts: { body: string; heading: string; mono: string };
  light: DraftPalette;
  dark: DraftPalette;
}

const topLevelKeys = new Set(["version", "mode", "radius", "fonts", "light", "dark"]);

function copyPalette(palette: DraftPalette): DraftPalette {
  return { ...palette, chart: [...palette.chart] };
}

/** A draft of a validated theme, to start editing from a preset. */
export function draftFromTheme(theme: Theme | ThemeDraft): ThemeDraft {
  return { version: 1, mode: theme.mode, radius: theme.radius, fonts: { ...theme.fonts }, light: copyPalette(theme.light), dark: copyPalette(theme.dark) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

function coercePalette(value: unknown, fallback: DraftPalette): DraftPalette {
  if (!isRecord(value)) return copyPalette(fallback);
  const next = copyPalette(fallback);
  for (const key of themeColorKeys) next[key] = text(value[key], fallback[key]);
  if (Array.isArray(value.chart)) next.chart = value.chart.map((item) => text(item, ""));
  return next;
}

function coerceFonts(value: unknown, fallback: ThemeDraft["fonts"]): ThemeDraft["fonts"] {
  if (!isRecord(value)) return { ...fallback };
  return { body: text(value.body, fallback.body), heading: text(value.heading, fallback.heading), mono: text(value.mono, fallback.mono) };
}

/** The result of reading the raw JSON tab. */
export type DraftJsonParse = { ok: true; draft: ThemeDraft } | { ok: false; message: string };

/**
 * Reads theme JSON typed in the raw tab into a draft. Values that are
 * missing or not text keep `fallback`'s, so a partial edit never wipes the
 * form; unknown top-level keys are refused, as the server refuses them.
 */
export function draftFromJson(input: string, fallback: ThemeDraft): DraftJsonParse {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return { ok: false, message: "This is not valid JSON yet. Check for a missing comma, quote, or brace." };
  }
  if (!isRecord(value)) return { ok: false, message: "Theme JSON is an object: { \"version\": 1, \"light\": {…}, \"dark\": {…} }." };
  const unknown = Object.keys(value).find((key) => !topLevelKeys.has(key));
  if (unknown !== undefined) return { ok: false, message: `Unknown key "${unknown.slice(0, 40)}". A theme has only version, mode, radius, fonts, light, and dark.` };
  return {
    ok: true,
    draft: {
      version: 1,
      mode: text(value.mode, fallback.mode),
      radius: text(value.radius, fallback.radius),
      fonts: coerceFonts(value.fonts, fallback.fonts),
      light: coercePalette(value.light, fallback.light),
      dark: coercePalette(value.dark, fallback.dark),
    },
  };
}

/** The draft as pretty JSON for the raw tab. */
export function draftJson(draft: ThemeDraft): string {
  return JSON.stringify(draft, null, 2);
}

/** Validation issues grouped by path, so each field shows its own. Chart items ("light.chart.3") group under "light.chart". */
export function issuesByPath(issues: readonly ThemeIssue[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const issue of issues) {
    const path = issue.path.replace(/^((?:light|dark)\.chart)\.\d+$/, "$1");
    grouped.set(path, [...(grouped.get(path) ?? []), issue.message]);
  }
  return grouped;
}

/** The draft with the suggested contrast fixes applied (each change's `path` is "<mode>.<colorKey>"). */
export function applyContrastChanges(draft: ThemeDraft, changes: readonly ContrastChange[]): ThemeDraft {
  const next = draftFromTheme(draft);
  for (const change of changes) {
    const [mode, key] = change.path.split(".");
    const palette = mode === "light" ? next.light : mode === "dark" ? next.dark : null;
    const colorKey = themeColorKeys.find((item) => item === key);
    if (palette && colorKey) palette[colorKey] = change.to;
  }
  return next;
}

/** Chart colors as the editor's text box shows them: one per line. */
export function chartToText(colors: readonly string[]): string {
  return colors.join("\n");
}

/** Chart colors from the text box: one per line, blank lines dropped. */
export function chartFromText(input: string): string[] {
  return input.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}
