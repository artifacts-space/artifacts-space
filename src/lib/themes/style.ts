import { paletteTokens, type PaletteMode } from "./derive";
import { fontPreloadHref, fontStack, fontStylesheet, themeFont, type ThemeFont } from "./fonts";
import { siteDefaultTheme } from "./resolve";
import { radiusScale, type Theme, type ThemeColors } from "./schema";

/**
 * Maps a validated theme to CSS custom properties for a wrapper element's
 * React `style`. Only token names this module chooses and canonical values
 * from the validated theme are emitted; theme JSON never becomes raw CSS.
 *
 * Both modes travel in one value as `light-dark(light, dark)`, which the
 * browser resolves from the inherited `color-scheme` (set by the site's
 * `.light`/`.dark` scopes). The reader's light or dark choice therefore
 * applies with no script and no flash, and a mode lock just adds the
 * `.light` or `.dark` class and emits that mode's plain values.
 */

/** Custom properties, keyed by `--name`. */
export type ThemeStyle = Record<string, string>;

/** Everything a wrapper needs to render a theme. */
export interface ThemeScopeProps {
  style: ThemeStyle;
  /** The class that pins the mode, or null to follow the reader. */
  modeClass: PaletteMode | null;
  /** True when the theme sets colors (anything but the site default palette). */
  colored: boolean;
  /** Stylesheets of the vendored faces the theme uses, in slot order, without repeats. */
  stylesheets: string[];
  /** Upright font files worth preloading: the body and heading faces only (code fonts load when code appears). */
  preloads: string[];
}

function samePalette(a: ThemeColors, b: ThemeColors): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when both palettes equal the site default, so the site CSS already draws them. */
export function usesSitePalette(theme: Theme): boolean {
  const site = siteDefaultTheme();
  return samePalette(theme.light, site.light) && samePalette(theme.dark, site.dark);
}

/** The mode a scope pins: an explicit override (the preview's panels), else the theme's lock, else none. */
export function lockedMode(theme: Theme, override?: PaletteMode): PaletteMode | null {
  if (override) return override;
  return theme.mode === "auto" ? null : theme.mode;
}

function colorStyle(theme: Theme, mode: PaletteMode | null): ThemeStyle {
  if (mode) return paletteTokens(mode, theme[mode]);
  const light = paletteTokens("light", theme.light);
  const dark = paletteTokens("dark", theme.dark);
  const style: ThemeStyle = {};
  for (const [name, value] of Object.entries(light)) {
    const darkValue = dark[name] ?? value;
    style[name] = value === darkValue ? value : `light-dark(${value}, ${darkValue})`;
  }
  return style;
}

function slotFonts(theme: Theme): { body: ThemeFont | undefined; heading: ThemeFont | undefined; mono: ThemeFont | undefined } {
  return { body: themeFont(theme.fonts.body), heading: themeFont(theme.fonts.heading), mono: themeFont(theme.fonts.mono) };
}

function fontStyle(theme: Theme): ThemeStyle {
  const { body, heading, mono } = slotFonts(theme);
  const style: ThemeStyle = {};
  if (body && body.id !== "geist-sans") style["--theme-font-body"] = fontStack(body);
  if (heading && heading.id !== "geist-sans") style["--theme-font-heading"] = fontStack(heading);
  if (mono && mono.id !== "geist-mono") style["--theme-font-mono"] = fontStack(mono);
  return style;
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

/** The font stylesheets and preloads a theme needs. Empty for Geist, which the root layout always loads. */
export function themeFontAssets(theme: Theme): Pick<ThemeScopeProps, "stylesheets" | "preloads"> {
  const { body, heading, mono } = slotFonts(theme);
  const faces = [body, heading, mono].filter((font): font is ThemeFont => font !== undefined);
  return {
    stylesheets: unique(faces.map(fontStylesheet)),
    preloads: unique([body, heading].map((font) => (font ? fontPreloadHref(font) : null))),
  };
}

/**
 * The style, mode class, and font assets for a theme. Values equal to the
 * site default are left out (the Default preset emits no colors and no
 * fonts), so an unthemed artifact renders exactly as the site CSS draws it.
 */
export function themeScopeProps(theme: Theme, modeOverride?: PaletteMode): ThemeScopeProps {
  const mode = lockedMode(theme, modeOverride);
  const colored = !usesSitePalette(theme);
  const radius: ThemeStyle = theme.radius === "md" ? {} : { "--radius": radiusScale[theme.radius] };
  return {
    style: { ...(colored ? colorStyle(theme, mode) : {}), ...radius, ...fontStyle(theme) },
    modeClass: mode,
    colored,
    ...themeFontAssets(theme),
  };
}

/**
 * The backdrop color behind an artifact, as `--theme-backdrop`, for the
 * area around the content. It sets nothing else, so the site header,
 * comments, and controls placed on it keep the standard look.
 */
export function themeBackdropStyle(theme: Theme, modeOverride?: PaletteMode): ThemeStyle {
  if (usesSitePalette(theme)) return {};
  const mode = lockedMode(theme, modeOverride);
  if (mode) return { "--theme-backdrop": theme[mode].background };
  const { light, dark } = theme;
  return { "--theme-backdrop": light.background === dark.background ? light.background : `light-dark(${light.background}, ${dark.background})` };
}

/** A short, stable key for a theme, so views that draw their own colors (Mermaid) redraw when it changes. FNV-1a over the JSON. */
export function themeKey(theme: Theme): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(theme)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** What the artifact page around the artifact (header, comments, footer) needs to wear its theme. */
export interface ThemeChromeProps {
  /** The class that pins the mode, or null to follow the reader. */
  modeClass: PaletteMode | null;
  /** The theme's color tokens only: no fonts and no radius, so the page keeps the site's type and shapes. */
  style: ThemeStyle;
}

/**
 * The colors for the page around an artifact (the header with the logo,
 * visibility, GitHub, and Copy; the comments; the footer), so it changes with
 * the artifact's theme: the same validated color tokens the content and
 * backdrop use, and the same mode lock. The site default emits nothing, so an
 * unthemed artifact's page looks as it always has.
 */
export function themeChromeProps(theme: Theme, modeOverride?: PaletteMode): ThemeChromeProps {
  const mode = lockedMode(theme, modeOverride);
  return { modeClass: mode, style: usesSitePalette(theme) ? {} : colorStyle(theme, mode) };
}
