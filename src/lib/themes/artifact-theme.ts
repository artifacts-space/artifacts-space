import { z } from "zod";

import { artifactThemeLimits } from "./artifact-theme-limits";
import { normalizeColor } from "./color";
import { autofixContrast, type ContrastChange } from "./contrast";
import { fontIdsFor, themeFont, type ThemeFontId } from "./fonts";
import { themePresets } from "./presets";
import { builtInPresets } from "./resolve";
import { parseTheme, themeColorKeys, type Theme, type ThemeColors, type ThemeIssue } from "./schema";

/**
 * An artifact's own theme, as stored on the artifact and each version: a
 * built-in preset id, or a validated theme already normalised by parseTheme.
 * No value (null) means the artifact has no theme of its own and renders
 * with the team default, then the site default (resolveTheme).
 */
export type StoredArtifactTheme = string | Theme;

/** The result of checking a theme someone wants to save. */
export type ArtifactThemeParse = { ok: true; theme: StoredArtifactTheme | null } | { ok: false; message: string };

/** Where people and agents read the rules. */
export const THEME_DOCS_PATH = "/docs/themes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function presetIdList(): string {
  return themePresets.map((preset) => preset.id).join(", ");
}

function parsePresetId(input: string): ArtifactThemeParse {
  const id = input.trim();
  if (id === "") return { ok: true, theme: null };
  if (builtInPresets().has(id)) return { ok: true, theme: id };
  return { ok: false, message: `"${id.slice(0, 40)}" is not a theme preset. Use one of: ${presetIdList()} (themes_list describes them), or theme JSON (${THEME_DOCS_PATH}).` };
}

/** One palette's colors, normalised, when every key is present and parses; null otherwise. */
function normalizedPalette(value: unknown): ThemeColors | null {
  if (!isRecord(value)) return null;
  const colors = themeColorKeys.map((key) => {
    const raw = value[key];
    return typeof raw === "string" ? normalizeColor(raw) : null;
  });
  const [background, foreground, mutedForeground, card, cardEdge, accent, accentForeground] = colors;
  if (!background || !foreground || !mutedForeground || !card || !cardEdge || !accent || !accentForeground) return null;
  return { background, foreground, mutedForeground, card, cardEdge, accent, accentForeground, chart: [] };
}

/**
 * The nearest passing colors for a theme that fails only on contrast, from
 * autofixContrast. Empty when the palettes do not parse or nothing can be
 * fixed by moving text colors (surface lightness is never changed).
 */
export function contrastSuggestions(input: unknown): ContrastChange[] {
  if (!isRecord(input)) return [];
  const light = normalizedPalette(input.light);
  const dark = normalizedPalette(input.dark);
  if (!light || !dark) return [];
  return autofixContrast({ light, dark }).changes;
}

const isContrastIssue = (issue: ThemeIssue) => issue.message.includes("(WCAG AA)");

/** Every problem as a list, plus passing colors when contrast failed, and where the rules are. */
export function themeIssuesMessage(issues: readonly ThemeIssue[], input: unknown): string {
  const lines = issues.slice(0, 12).map((issue) => `- ${issue.path}: ${issue.message}`);
  if (issues.length > 12) lines.push(`- …and ${String(issues.length - 12)} more.`);
  const fixes = issues.some(isContrastIssue) ? contrastSuggestions(input) : [];
  const fixLines = fixes.length > 0 ? ["Nearest passing colors (autofix):", ...fixes.map((change) => `- set ${change.path} to ${change.to}`)] : [];
  const help = `Fix these and save again, or pass a preset id instead (themes_list). Rules: ${THEME_DOCS_PATH}#validation and ${THEME_DOCS_PATH}#contrast.`;
  return ["The theme is not valid:", ...lines, ...fixLines, help].join("\n");
}

function parseThemeJson(input: Record<string, unknown>): ArtifactThemeParse {
  if (JSON.stringify(input).length > artifactThemeLimits.maxInputChars) {
    return { ok: false, message: `Theme JSON is too long. Keep it under ${String(artifactThemeLimits.maxInputChars)} characters.` };
  }
  const result = parseTheme(input);
  if (result.ok) return { ok: true, theme: result.theme };
  return { ok: false, message: themeIssuesMessage(result.issues, input) };
}

/**
 * Checks a theme someone wants to save on an artifact. Accepts a built-in
 * preset id, theme JSON (validated and normalised by parseTheme, including
 * the contrast check), or null/"" to remove it. Invalid input returns a
 * message that lists every problem and, for contrast failures, the nearest
 * passing colors.
 */
export function parseArtifactThemeInput(input: unknown): ArtifactThemeParse {
  if (input === null || input === undefined) return { ok: true, theme: null };
  if (typeof input === "string") return parsePresetId(input);
  if (isRecord(input)) return parseThemeJson(input);
  return { ok: false, message: `A theme is a preset id (a string such as "paper") or theme JSON (an object). See ${THEME_DOCS_PATH}.` };
}

/** The raw shape a theme field accepts, before parseArtifactThemeInput checks it. Also the MCP input shape. */
export const artifactThemeRawSchema = z
  .union([z.string().max(artifactThemeLimits.maxPresetIdChars, "A preset id is at most 64 characters."), z.record(z.string(), z.unknown())])
  .nullable();

/** Zod field for the data layer and server actions: checks the theme and returns the value to store. */
export const artifactThemeInputSchema = artifactThemeRawSchema.transform((value, ctx): StoredArtifactTheme | null => {
  const result = parseArtifactThemeInput(value);
  if (result.ok) return result.theme;
  ctx.addIssue({ code: "custom", message: result.message });
  return z.NEVER;
});

/** Keys sorted at every level, so two equal themes print the same whatever order their keys came in. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

/** True when two stored themes are the same (null and undefined count as no theme). */
export function sameArtifactTheme(a: StoredArtifactTheme | null | undefined, b: StoredArtifactTheme | null | undefined): boolean {
  return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
}

/** A short name for a stored theme: the preset's name, "Custom", or "Default" when there is none. */
export function themeLabel(theme: StoredArtifactTheme | null | undefined): string {
  if (theme === null || theme === undefined) return "Default";
  if (typeof theme !== "string") return "Custom";
  return builtInPresets().get(theme)?.name ?? theme;
}

/** The preset id a picker highlights: the stored id, "custom" for theme JSON, or "default" for none. */
export function pickerValue(theme: StoredArtifactTheme | null | undefined): string {
  if (theme === null || theme === undefined) return "default";
  return typeof theme === "string" ? theme : "custom";
}

/** One preset as themes_list returns it. */
export interface ThemePresetSummary {
  id: string;
  name: string;
  description: string;
  mode: Theme["mode"];
  fonts: Record<"body" | "heading" | "mono", { id: ThemeFontId; family: string }>;
}

function fontEntry(id: ThemeFontId) {
  return { id, family: themeFont(id)?.family ?? id };
}

/** Every built-in preset with its fonts, for the themes_list MCP tool and the pickers. */
export function themePresetSummaries(): ThemePresetSummary[] {
  return [...builtInPresets().values()].map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    mode: preset.theme.mode,
    fonts: { body: fontEntry(preset.theme.fonts.body), heading: fontEntry(preset.theme.fonts.heading), mono: fontEntry(preset.theme.fonts.mono) },
  }));
}

/** The fonts theme JSON may name, by slot, for agents writing custom themes. */
export function allowedThemeFonts(): Record<"body" | "heading" | "mono", ThemeFontId[]> {
  return { body: fontIdsFor("body"), heading: fontIdsFor("heading"), mono: fontIdsFor("mono") };
}

/** How agents set a theme, for the MCP field description and the formats guide. */
export const THEME_FIELD_DESCRIPTION = [
  'Optional theme for the artifact page: a preset id from themes_list (such as "paper"), or theme JSON:',
  '{"version":1,"light":{background,foreground,mutedForeground,card,cardEdge,accent,accentForeground,chart:[6-8 colors]},"dark":{…same keys},"fonts"?:{body,heading,mono},"radius"?,"mode"?}.',
  `Colors are hex, rgb(), hsl(), or oklch(). Text must pass WCAG AA contrast in both palettes; a failing theme is refused with each pair, its ratio, and the nearest passing color. Full rules: ${THEME_DOCS_PATH}.`,
  'Pass null or "" on update to remove it, so the page uses the default look. Theme changes are versioned and reviewed like title changes.',
].join(" ");
