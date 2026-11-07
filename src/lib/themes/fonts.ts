/**
 * The theme font allowlist. Geist Sans and Geist Mono are the site's own
 * fonts, loaded by the root layout through next/font. Every other face is
 * vendored under `public/fonts/v1/<id>/` (latin subset, woff2, SIL OFL 1.1)
 * with its own small `font.css`, and loads only on a page whose theme uses
 * it: ThemeScope adds that face's stylesheet and preloads its file. No face
 * is ever loaded from another origin.
 */

/** Which theme slots a face may fill. */
export type FontRole = "body" | "heading" | "mono";

/** One allowlisted face. */
export interface ThemeFont {
  id: string;
  /** The display name and the CSS font-family name. */
  family: string;
  roles: readonly FontRole[];
  /** The generic family the stack ends with. */
  generic: "sans" | "serif" | "mono";
  /** The site's own Geist fonts are always loaded; every other face is vendored and loaded on demand. */
  vendored: boolean;
  /** The upright latin file, preloaded when the face is a theme's body or heading font. */
  file: string | null;
  /** Bytes of the upright latin woff2 (the file a page downloads for normal text). */
  bytes: number;
}

const textRoles = ["body", "heading"] as const;
const headingOnly = ["heading"] as const;
const monoOnly = ["mono"] as const;

/** Every allowlisted face, in picker order. */
export const themeFonts = [
  { id: "geist-sans", family: "Geist Sans", roles: textRoles, generic: "sans", vendored: false, file: null, bytes: 0 },
  { id: "inter", family: "Inter", roles: textRoles, generic: "sans", vendored: true, file: "inter-normal-100-900.woff2", bytes: 48_432 },
  { id: "roboto", family: "Roboto", roles: textRoles, generic: "sans", vendored: true, file: "roboto-normal-100-900.woff2", bytes: 37_520 },
  { id: "work-sans", family: "Work Sans", roles: textRoles, generic: "sans", vendored: true, file: "work-sans-normal-100-900.woff2", bytes: 50_524 },
  { id: "dm-sans", family: "DM Sans", roles: textRoles, generic: "sans", vendored: true, file: "dm-sans-normal-100-1000.woff2", bytes: 36_980 },
  { id: "manrope", family: "Manrope", roles: textRoles, generic: "sans", vendored: true, file: "manrope-normal-200-800.woff2", bytes: 24_436 },
  { id: "ibm-plex-sans", family: "IBM Plex Sans", roles: textRoles, generic: "sans", vendored: true, file: "ibm-plex-sans-normal-100-700.woff2", bytes: 40_240 },
  { id: "source-serif-4", family: "Source Serif 4", roles: textRoles, generic: "serif", vendored: true, file: "source-serif-4-normal-200-900.woff2", bytes: 50_952 },
  { id: "instrument-serif", family: "Instrument Serif", roles: headingOnly, generic: "serif", vendored: true, file: "instrument-serif-normal-400.woff2", bytes: 15_040 },
  { id: "fraunces", family: "Fraunces", roles: headingOnly, generic: "serif", vendored: true, file: "fraunces-normal-100-900.woff2", bytes: 36_560 },
  { id: "geist-mono", family: "Geist Mono", roles: monoOnly, generic: "mono", vendored: false, file: null, bytes: 0 },
  { id: "jetbrains-mono", family: "JetBrains Mono", roles: monoOnly, generic: "mono", vendored: true, file: "jetbrains-mono-normal-100-800.woff2", bytes: 40_480 },
  { id: "ibm-plex-mono", family: "IBM Plex Mono", roles: monoOnly, generic: "mono", vendored: true, file: "ibm-plex-mono-normal-400.woff2", bytes: 10_052 },
] as const satisfies readonly ThemeFont[];

export type ThemeFontId = (typeof themeFonts)[number]["id"];

/** Where the vendored files live. The version segment changes whenever a file changes, so they can be cached forever. */
export const FONT_BASE_PATH = "/fonts/v1";

const byId = new Map<string, ThemeFont>(themeFonts.map((font) => [font.id, font]));

/** The face with this id, or undefined when it is not on the allowlist. */
export function themeFont(id: string): ThemeFont | undefined {
  return byId.get(id);
}

/** The ids allowed in one slot, in picker order. */
export function fontIdsFor(role: FontRole): ThemeFontId[] {
  return themeFonts.filter((font) => (font.roles as readonly FontRole[]).includes(role)).map((font) => font.id);
}

const genericStacks = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/**
 * The CSS font-family stack for a face. Geist reads the variables the root
 * layout defines; a vendored face names its @font-face family, then its
 * metric-matched fallback (sans and serif faces), then the generic stack.
 */
export function fontStack(font: ThemeFont): string {
  if (font.id === "geist-sans") return `var(--font-geist-sans), ${genericStacks.sans}`;
  if (font.id === "geist-mono") return `var(--font-geist-mono), ${genericStacks.mono}`;
  const fallback = font.generic === "mono" ? "" : `, "${font.family} Fallback"`;
  return `"${font.family}"${fallback}, ${genericStacks[font.generic]}`;
}

/** The stylesheet that declares a vendored face, or null for the always-loaded Geist fonts. */
export function fontStylesheet(font: ThemeFont): string | null {
  return font.vendored ? `${FONT_BASE_PATH}/${font.id}/font.css` : null;
}

/** The upright file to preload for a vendored face, or null. */
export function fontPreloadHref(font: ThemeFont): string | null {
  return font.vendored && font.file ? `${FONT_BASE_PATH}/${font.id}/${font.file}` : null;
}
