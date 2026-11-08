import { artifactThemeLimits } from "./artifact-theme-limits";
import { contrastSuggestions } from "./artifact-theme";
import type { ContrastChange } from "./contrast";
import { draftFromTheme, type ThemeDraft } from "./preset-draft";
import { parseTheme, parseThemeForPreview, type Theme } from "./schema";
import { slugifyPresetName } from "./team-preset-rules";

/**
 * Theme JSON in and out of the team preset editor. Export writes the
 * validated theme exactly as agents and the docs use it, so it can be sent
 * to an agent or imported into another team. Import reads theme JSON with
 * the same check the server runs (parseTheme): a theme whose only problem is
 * contrast loads with the nearest passing colors suggested, and saving stays
 * refused until it passes; anything else is refused with every problem.
 */

/** Longest import text, pretty-printed with whitespace, before it is parsed. */
export const THEME_IMPORT_MAX_TEXT = artifactThemeLimits.maxInputChars * 8;

/** Largest theme file the editor reads (64 KB). */
export const THEME_IMPORT_MAX_FILE_BYTES = 65_536;

/** The result of importing theme JSON. */
export type ThemeImport =
  | { ok: true; draft: ThemeDraft; suggestions: ContrastChange[]; message: string }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const MAX_LISTED = 6;

function problemList(issues: readonly { path: string; message: string }[]): string {
  const lines = issues.slice(0, MAX_LISTED).map((issue) => `${issue.path}: ${issue.message}`);
  if (issues.length > MAX_LISTED) lines.push(`…and ${String(issues.length - MAX_LISTED)} more.`);
  return lines.join(" ");
}

/**
 * Reads pasted or uploaded theme JSON for the preset editor. Returns the
 * draft to load (normalised colors) and any contrast suggestions, or a
 * message saying why it cannot be used.
 */
export function importThemeJson(text: string): ThemeImport {
  if (text.trim() === "") return { ok: false, message: "Paste theme JSON or choose a .json file first." };
  if (text.length > THEME_IMPORT_MAX_TEXT) return { ok: false, message: "That is too long to be a theme. A theme is about 2 KB of JSON." };
  const read = readJson(text);
  if (!read.ok) return { ok: false, message: "This is not valid JSON. Check for a missing comma, quote, or brace." };
  const value = read.value;
  if (!isRecord(value)) return { ok: false, message: "Theme JSON is an object: { \"version\": 1, \"light\": {…}, \"dark\": {…} }." };
  if (JSON.stringify(value).length > artifactThemeLimits.maxInputChars) {
    return { ok: false, message: `Theme JSON is too long. Keep it under ${String(artifactThemeLimits.maxInputChars)} characters.` };
  }
  const parsed = parseTheme(value);
  if (parsed.ok) return { ok: true, draft: draftFromTheme(parsed.theme), suggestions: [], message: "Theme imported. Check the preview, then save." };
  // Every key is known and every color parses: only contrast fails, which the editor can fix.
  const drawable = parseThemeForPreview(value);
  if (!drawable) return { ok: false, message: `This theme cannot be used. ${problemList(parsed.issues)}` };
  const suggestions = contrastSuggestions(value);
  const advice = suggestions.length > 0 ? "Apply the suggested colors, or fix them yourself, before you save." : "Fix the marked colors before you save.";
  return { ok: true, draft: draftFromTheme(drawable), suggestions, message: `Theme imported, but some text is hard to read. ${advice}` };
}

/** A validated theme as pretty JSON, ready to copy, download, or send to an agent. */
export function themeExportJson(theme: Theme): string {
  return `${JSON.stringify(theme, null, 2)}\n`;
}

/** The download name for a theme: the preset's name as a slug, such as "acme-brand.theme.json". */
export function themeFileName(name: string): string {
  return `${slugifyPresetName(name.trim() || "theme")}.theme.json`;
}
