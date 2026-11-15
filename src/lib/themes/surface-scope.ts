import type { BlockHue } from "@/lib/block-colors/block-color-rules";

import { contrastRatio, ensureContrast, formatOklch, mixOklch, parseColor, relativeLuminance, type Oklch } from "./color";
import { paletteTokens, type PaletteMode } from "./derive";
import type { Theme, ThemeColors } from "./schema";
import { usesSitePalette } from "./style";

/**
 * Surfaces inside an interface (a Box's `surface`), as scopes of the theme.
 * A strong surface (inverse, primary) switches everything inside it to a
 * palette that reads on it, the way ThemeScope does for the whole artifact:
 * inverse is the theme's other mode, and primary is a palette built on the
 * theme's accent. A quiet surface (the muted fill, a block hue) keeps the
 * palette and only re-lights body and secondary text where the theme leaves
 * them under 4.5:1 on that fill. Values reach the page as custom properties
 * in an element's `style`, like every other theme value.
 */

/** Surfaces that switch the palette inside them. */
export type StrongSurface = "inverse" | "primary";

/** Surfaces that keep the palette: the quiet fill and the block hue backgrounds. */
export type QuietFill = "muted" | BlockHue;

/** What a view needs to draw a strong surface, and what the views inside it are told. */
export interface StrongScope {
  /** `theme-invert`, or the class that pins the other mode; null when the style alone carries the palette. */
  className: string | null;
  style: Record<string, string>;
  inner: SurfaceScopeState;
}

/** The theme as seen from inside a scope. */
export interface SurfaceScopeState {
  /** The pinned mode inside the scope, or null when it follows the reader. */
  mode: PaletteMode | null;
  /** True when the scope follows the reader but shows the opposite mode (inside an inverse surface). */
  flipped: boolean;
  /** Changes with the theme and the scope, so views that draw their own colors redraw. */
  key: string;
  surfaces: SurfaceEngine;
}

/** Scopes for the surfaces of one theme, as ThemeScope hands them to views. */
export interface SurfaceEngine {
  strong: (surface: StrongSurface) => StrongScope;
  quietInk: (fill: QuietFill) => Record<string, string>;
}

/** One side of a theme: its palette, and the mode its tokens are derived in. */
interface Side {
  mode: PaletteMode;
  colors: ThemeColors;
  /** True for a palette built on the accent, where a status tone may have no lightness that reads. */
  onAccent?: boolean;
}

interface Scope {
  light: Side;
  dark: Side;
  pinned: PaletteMode | null;
  flipped: boolean;
  /** Both palettes are the site's, so the site CSS already holds every token. */
  site: boolean;
  key: string;
}

const textMinimum = 4.55;
const black: Oklch = { l: 0, c: 0, h: 0, alpha: 1 };
const read = (value: string | undefined): Oklch => (value ? parseColor(value) : null) ?? black;
const other = (mode: PaletteMode): PaletteMode => (mode === "light" ? "dark" : "light");

const tokenCache = new WeakMap<ThemeColors, Record<string, string>>();

const toneNames = ["--tone-info", "--tone-success", "--tone-warning", "--tone-danger"] as const;

/**
 * On an accent of middling lightness a tone can run out of room before it
 * reads (a red tone on a red accent). It then takes the accent's own label
 * color, which the theme rules already hold at 4.5:1 there.
 */
function tonesOnAccent(tokens: Record<string, string>, colors: ThemeColors): Record<string, string> {
  const page = read(colors.background);
  const held = { ...tokens };
  for (const name of toneNames) {
    if (contrastRatio(read(tokens[name]), page) < textMinimum) held[name] = colors.foreground;
  }
  return held;
}

function tokensOf(side: Side): Record<string, string> {
  const cached = tokenCache.get(side.colors);
  if (cached) return cached;
  const derived = paletteTokens(side.mode, side.colors);
  const tokens = side.onAccent ? tonesOnAccent(derived, side.colors) : derived;
  tokenCache.set(side.colors, tokens);
  return tokens;
}

/** Both modes in one value, as style.ts writes them: the browser picks by the inherited color-scheme. */
function paired(light: Record<string, string>, dark: Record<string, string>): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(light)) {
    const darkValue = dark[name] ?? value;
    style[name] = value === darkValue ? value : `light-dark(${value}, ${darkValue})`;
  }
  return style;
}

function scopeStyle(scope: Scope): Record<string, string> {
  if (scope.site) return {};
  if (scope.pinned) return tokensOf(scope[scope.pinned]);
  return paired(tokensOf(scope.light), tokensOf(scope.dark));
}

/**
 * The other mode of the same theme. Following the reader, `theme-invert`
 * flips the color-scheme, so the theme's own light-dark() values resolve to
 * the other side; they are set again here because that class also sets the
 * site palette on its element. Pinned, the other mode's class and plain
 * values do the same.
 */
function inverseScope(scope: Scope): StrongScope {
  if (scope.pinned) {
    const inner: Scope = { ...scope, pinned: other(scope.pinned), key: `${scope.key}:inverse` };
    return { className: inner.pinned, style: scopeStyle(inner), inner: stateOf(inner) };
  }
  const inner: Scope = { ...scope, flipped: true, key: `${scope.key}:inverse` };
  return { className: "theme-invert", style: scopeStyle(scope), inner: stateOf(inner) };
}

/** A palette that sits on the accent: the accent is the page and the card, its label color is the ink, and buttons swap the two. */
function accentSide(colors: ThemeColors): Side {
  const accent = read(colors.accent);
  const ink = read(colors.accentForeground);
  const side: ThemeColors = {
    ...colors,
    background: colors.accent,
    card: colors.accent,
    foreground: colors.accentForeground,
    mutedForeground: formatOklch(ensureContrast(mixOklch(ink, accent, 0.25), accent, textMinimum)),
    cardEdge: formatOklch({ ...ink, alpha: 0.16 }),
    accent: colors.accentForeground,
    accentForeground: colors.accent,
  };
  return { mode: relativeLuminance(accent) > 0.18 ? "light" : "dark", colors: side, onAccent: true };
}

const accentCache = new WeakMap<ThemeColors, Side>();

function accentSideOf(colors: ThemeColors): Side {
  const cached = accentCache.get(colors);
  if (cached) return cached;
  const side = accentSide(colors);
  accentCache.set(colors, side);
  return side;
}

/** The site's accent is its ink, so on the site palette primary is the inverse surface. */
function primaryScope(scope: Scope): StrongScope {
  if (scope.site) return inverseScope(scope);
  const inner: Scope = { ...scope, light: accentSideOf(scope.light.colors), dark: accentSideOf(scope.dark.colors), key: `${scope.key}:primary` };
  return { className: null, style: scopeStyle(inner), inner: stateOf(inner) };
}

const quietInkNames = ["--foreground", "--muted-foreground"] as const;

/** Body and secondary text on one side's fill: each as the theme has it, or re-lit when it is under 4.5:1 there. */
function quietSide(side: Side, fill: QuietFill): { inks: Record<string, string>; relit: Set<string> } {
  const tokens = tokensOf(side);
  const surface = read(tokens[fill === "muted" ? "--muted" : `--block-${fill}-bg`]);
  const inks: Record<string, string> = {};
  const relit = new Set<string>();
  for (const name of quietInkNames) {
    const ink = read(tokens[name]);
    const reads = contrastRatio(ink, surface) >= textMinimum;
    inks[name] = reads ? (tokens[name] ?? "") : formatOklch(ensureContrast(ink, surface, textMinimum));
    if (!reads) relit.add(name);
  }
  return { inks, relit };
}

/** One value for a pinned scope, or both modes as light-dark() when they differ. */
function modeValue(values: string[]): string {
  const [light = "", dark = light] = values;
  return light === dark ? light : `light-dark(${light}, ${dark})`;
}

/** Body and secondary text re-lit for a quiet fill, only where the theme leaves one under 4.5:1 there. */
function quietInk(scope: Scope, fill: QuietFill): Record<string, string> {
  if (scope.site) return {};
  const sides = (scope.pinned ? [scope[scope.pinned]] : [scope.light, scope.dark]).map((side) => quietSide(side, fill));
  const names = quietInkNames.filter((name) => sides.some((side) => side.relit.has(name)));
  return Object.fromEntries(names.map((name) => [name, modeValue(sides.map((side) => side.inks[name] ?? ""))]));
}

function stateOf(scope: Scope): SurfaceScopeState {
  const strong = new Map<StrongSurface, StrongScope>();
  const quiet = new Map<QuietFill, Record<string, string>>();
  return {
    mode: scope.pinned,
    flipped: scope.flipped,
    key: scope.key,
    surfaces: {
      strong: (surface) => {
        const made = strong.get(surface) ?? (surface === "primary" ? primaryScope(scope) : inverseScope(scope));
        strong.set(surface, made);
        return made;
      },
      quietInk: (fill) => {
        const made = quiet.get(fill) ?? quietInk(scope, fill);
        quiet.set(fill, made);
        return made;
      },
    },
  };
}

/**
 * The surface scopes of a theme, for ThemeScope to hand to the views inside
 * it. `pinned` is the scope's mode lock, or null when it follows the reader.
 * Nothing is derived until a view asks for a surface.
 */
export function surfaceEngine(theme: Theme, pinned: PaletteMode | null, key: string): SurfaceEngine {
  const scope: Scope = { light: { mode: "light", colors: theme.light }, dark: { mode: "dark", colors: theme.dark }, pinned, flipped: false, site: usesSitePalette(theme), key };
  return stateOf(scope).surfaces;
}
