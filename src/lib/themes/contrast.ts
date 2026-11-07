import { contrastRatio, ensureContrast, formatOklch, parseColor, type Oklch } from "./color";
import type { Theme, ThemeColorKey, ThemeColors, ThemeIssue } from "./schema";

/**
 * Contrast policy: a theme whose text and surfaces fail WCAG AA is rejected
 * with an issue naming the pair and its ratio. Nothing is adjusted silently,
 * because a theme an agent or editor saved should render exactly as written.
 * `autofixContrast` is a separate helper that suggests the nearest passing
 * colors, for a future editor to offer.
 */

type PaletteMode = "light" | "dark";
type ColorPair = Pick<Theme, "light" | "dark">;

/** One checked pair: `text` drawn on `surface` must reach `minimum`. */
export interface ContrastPair {
  text: ThemeColorKey;
  surface: ThemeColorKey;
  minimum: number;
  /** Why the pair matters, for messages and docs. */
  use: string;
}

/**
 * Every pair checked in each mode. Body text needs 4.5:1. The accent needs
 * 3:1 against the card, the WCAG AA level for controls and large text.
 * Accent is fixed before its label, so a fix never breaks the label pair.
 */
export const contrastPairs: readonly ContrastPair[] = [
  { text: "foreground", surface: "background", minimum: 4.5, use: "body text on the page" },
  { text: "foreground", surface: "card", minimum: 4.5, use: "body text on cards" },
  { text: "mutedForeground", surface: "card", minimum: 4.5, use: "secondary text on cards" },
  { text: "mutedForeground", surface: "background", minimum: 4.5, use: "secondary text on the page" },
  { text: "accent", surface: "card", minimum: 3, use: "buttons and controls on cards" },
  { text: "accentForeground", surface: "accent", minimum: 4.5, use: "labels on accent buttons" },
];

/** Lightness bounds that keep each palette on its side, so status colors, shadows, and diagrams made for that mode stay readable. */
export const modeLightness = { light: { min: 0.7 }, dark: { max: 0.4 } } as const;

const surfaces = ["background", "card"] as const;

function color(palette: ThemeColors, key: ThemeColorKey): Oklch {
  return parseColor(palette[key]) ?? { l: 0, c: 0, h: 0, alpha: 1 };
}

const ratioText = (ratio: number) => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

function lightnessIssues(mode: PaletteMode, palette: ThemeColors): ThemeIssue[] {
  return surfaces.flatMap((key) => {
    const { l } = color(palette, key);
    const bad = mode === "light" ? l < modeLightness.light.min : l > modeLightness.dark.max;
    if (!bad) return [];
    const rule = mode === "light" ? `at least ${String(modeLightness.light.min)}` : `at most ${String(modeLightness.dark.max)}`;
    return [{ path: `${mode}.${key}`, message: `The ${mode} palette needs a ${mode} ${key}: oklch lightness ${rule}, but it is ${l.toFixed(3)}.` }];
  });
}

function pairIssues(mode: PaletteMode, palette: ThemeColors): ThemeIssue[] {
  return contrastPairs.flatMap((pair) => {
    const ratio = contrastRatio(color(palette, pair.text), color(palette, pair.surface));
    if (ratio >= pair.minimum) return [];
    const message = `${mode}.${pair.text} on ${mode}.${pair.surface} is ${ratioText(ratio)}; ${pair.use} needs at least ${String(pair.minimum)}:1 (WCAG AA).`;
    return [{ path: `${mode}.${pair.text}`, message }];
  });
}

/** Every contrast and lightness problem in both palettes. Empty when the theme passes. */
export function contrastIssues(theme: ColorPair): ThemeIssue[] {
  return (["light", "dark"] as const).flatMap((mode) => [...lightnessIssues(mode, theme[mode]), ...pairIssues(mode, theme[mode])]);
}

/** The measured ratio of every checked pair, for docs and the preview. */
export function contrastReport(palette: ThemeColors): { pair: ContrastPair; ratio: number; passes: boolean }[] {
  return contrastPairs.map((pair) => {
    const ratio = contrastRatio(color(palette, pair.text), color(palette, pair.surface));
    return { pair, ratio, passes: ratio >= pair.minimum };
  });
}

/** One color the autofix changed. */
export interface ContrastChange {
  path: string;
  from: string;
  to: string;
}

function fixPalette(mode: PaletteMode, palette: ThemeColors): { palette: ThemeColors; changes: ContrastChange[] } {
  const next: ThemeColors = { ...palette, chart: [...palette.chart] };
  const changes: ContrastChange[] = [];
  for (const pair of contrastPairs) {
    const before = next[pair.text];
    // A small margin above the minimum, so rounding never lands just under it.
    const fixed = formatOklch(ensureContrast(color(next, pair.text), color(next, pair.surface), pair.minimum + 0.05));
    if (contrastRatio(color(next, pair.text), color(next, pair.surface)) >= pair.minimum || fixed === before) continue;
    next[pair.text] = fixed;
    const path = `${mode}.${pair.text}`;
    const earlier = changes.find((change) => change.path === path);
    if (earlier) earlier.to = fixed;
    else changes.push({ path, from: before, to: fixed });
  }
  return { palette: next, changes };
}

/**
 * Suggests the nearest passing colors: each failing text color (and the
 * accent) moves in lightness, away from its surface, until it passes.
 * Surfaces never change. Not used by validation, which rejects instead.
 */
export function autofixContrast<T extends ColorPair>(theme: T): { theme: T; changes: ContrastChange[] } {
  const light = fixPalette("light", theme.light);
  const dark = fixPalette("dark", theme.dark);
  return { theme: { ...theme, light: light.palette, dark: dark.palette }, changes: [...light.changes, ...dark.changes] };
}
