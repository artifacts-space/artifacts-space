import type { BlockHue } from "@/lib/block-colors/block-color-rules";

import { contrastRatio, ensureContrast, formatOklch, mixOklch, paintOver, parseColor, relativeLuminance, type Oklch } from "./color";
import { nonTextMinimum, paletteTokens, toneTintMax, type PaletteMode } from "./derive";
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
  /** `theme-invert`, or the class that pins a mode; null when the style alone carries the palette. */
  className: string | null;
  style: Record<string, string>;
  inner: SurfaceScopeState;
}

/** The theme as seen from inside a scope. */
export interface SurfaceScopeState {
  /** The mode the palette inside the scope is, whatever the reader's; null when it follows the reader. */
  mode: PaletteMode | null;
  /** True when the scope follows the reader but shows the opposite mode (an inverse surface, or a primary one whose accent is of the other mode). */
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
 * reads as text and on its own tint (a red tone on a red accent, a badge
 * there). It then takes the accent's own label color, which the surface's
 * fill is set to hold as text and as a badge (accentFill).
 */
function tonesOnAccent(tokens: Record<string, string>, colors: ThemeColors): Record<string, string> {
  const page = read(colors.background);
  const held = { ...tokens };
  for (const name of toneNames) {
    if (!holdsBadge(read(tokens[name]), page)) held[name] = colors.foreground;
  }
  return held;
}

/** A diagram's lines are a mix of the surface and its ink, which falls short of 3:1 where an accent and its label are close: they are re-lit until they show. */
function linesOnAccent(tokens: Record<string, string>, colors: ThemeColors): Record<string, string> {
  return { ...tokens, "--diagram-line": formatOklch(ensureContrast(read(tokens["--diagram-line"]), read(colors.background), nonTextMinimum)) };
}

function tokensOf(side: Side): Record<string, string> {
  const cached = tokenCache.get(side.colors);
  if (cached) return cached;
  const derived = paletteTokens(side.mode, side.colors);
  const tokens = side.onAccent ? linesOnAccent(tonesOnAccent(derived, side.colors), side.colors) : derived;
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

/** True when `ink` reads on `surface` as text and on its own strongest tint there, which is what a badge is. */
function holdsBadge(ink: Oklch, surface: Oklch): boolean {
  return contrastRatio(ink, surface) >= textMinimum && contrastRatio(ink, paintOver(ink, toneTintMax, surface)) >= textMinimum;
}

/**
 * The fill of a primary surface: the accent, or the accent moved in
 * lightness away from its label, by the smallest step, until the label
 * reads there as text and as a badge. An accent of middling lightness
 * holds its label at 4.5:1 but leaves no color that reads on a tint of
 * itself; the step is what guarantees a status badge on the surface.
 */
function accentFill(accent: Oklch, ink: Oklch): Oklch {
  const direction = ink.l >= accent.l ? -1 : 1;
  let fill = accent;
  for (let step = 0; step < 200 && !holdsBadge(ink, fill); step += 1) {
    fill = { ...fill, l: Math.min(1, Math.max(0, fill.l + direction * 0.005)) };
  }
  return fill;
}

/**
 * A palette that sits on the accent: the accent is the page and the card,
 * its label color is the ink, and buttons swap the two. Its mode is the
 * fill's own: a dark accent makes a dark palette, in a light theme too.
 * Chart colors start from the side of the theme with that mode; the
 * palette rules then hold them at 3:1 on the accent, since a theme's chart
 * colors often sit right beside it.
 */
function accentSide(side: Side, otherSide: Side): Side {
  const { colors } = side;
  const accent = read(colors.accent);
  const ink = read(colors.accentForeground);
  const fill = accentFill(accent, ink);
  const surface = fill === accent ? colors.accent : formatOklch(fill);
  const mode: PaletteMode = relativeLuminance(fill) > 0.18 ? "light" : "dark";
  const onAccent: ThemeColors = {
    ...colors,
    background: surface,
    card: surface,
    foreground: colors.accentForeground,
    mutedForeground: formatOklch(ensureContrast(mixOklch(ink, fill, 0.25), fill, textMinimum)),
    cardEdge: formatOklch({ ...ink, alpha: 0.16 }),
    accent: colors.accentForeground,
    accentForeground: surface,
    chart: (mode === side.mode ? side : otherSide).colors.chart,
  };
  return { mode, colors: onAccent, onAccent: true };
}

const accentCache = new WeakMap<ThemeColors, Side>();

function accentSideOf(side: Side, otherSide: Side): Side {
  const cached = accentCache.get(side.colors);
  if (cached) return cached;
  const made = accentSide(side, otherSide);
  accentCache.set(side.colors, made);
  return made;
}

/** A pinned scope shows one accent palette. When that palette's mode is not the scope's, the mode's class pins it inside, as an inverse surface does. */
function pinnedPrimary(scope: Scope, side: Side, key: string): StrongScope {
  const inner: Scope = { ...scope, light: side, dark: side, pinned: side.mode, key };
  return { className: side.mode === scope.pinned ? null : side.mode, style: scopeStyle(inner), inner: stateOf(inner) };
}

/**
 * The palette on the theme's accent. The site's accent is its ink, so on the
 * site palette primary is the inverse surface. Everything inside is told the
 * mode the accent palette is, not the theme's: when a light theme has a dark
 * accent and its dark side a light one (the usual pair), the surface flips
 * the mode inside with `theme-invert`, so `dark:` styles, the color-scheme,
 * and views that draw their own colors all follow the surface they sit on.
 * When both accents are the same mode, views are told that mode and the
 * color-scheme stays the reader's, which is what picks each side's values.
 */
function primaryScope(scope: Scope): StrongScope {
  if (scope.site) return inverseScope(scope);
  const key = `${scope.key}:primary`;
  const light = accentSideOf(scope.light, scope.dark);
  const dark = accentSideOf(scope.dark, scope.light);
  if (scope.pinned) return pinnedPrimary(scope, scope.pinned === "light" ? light : dark, key);
  const crossed = light.mode === "dark" && dark.mode === "light";
  const inner: Scope = crossed ? { ...scope, light: dark, dark: light, flipped: !scope.flipped, key } : { ...scope, light, dark, key };
  return { className: crossed ? "theme-invert" : null, style: scopeStyle(inner), inner: stateOf(inner) };
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

/**
 * The mode a scope's palette is, as views are told. A scope's sides are
 * keyed by the color-scheme inside it; an accent palette under either key
 * can be of the other mode, or both can be the same one.
 */
function shownMode(scope: Scope): Pick<SurfaceScopeState, "mode" | "flipped"> {
  if (scope.pinned) return { mode: scope[scope.pinned].mode, flipped: false };
  if (scope.light.mode === scope.dark.mode) return { mode: scope.light.mode, flipped: false };
  return { mode: null, flipped: scope.light.mode === "light" ? scope.flipped : !scope.flipped };
}

function stateOf(scope: Scope): SurfaceScopeState {
  const strong = new Map<StrongSurface, StrongScope>();
  const quiet = new Map<QuietFill, Record<string, string>>();
  return {
    ...shownMode(scope),
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
