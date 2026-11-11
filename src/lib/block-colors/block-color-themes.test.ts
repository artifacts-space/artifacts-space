import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor, type Oklch } from "@/lib/themes/color";
import { blockColorTokens, blockFillGap, paletteTokens, type PaletteMode } from "@/lib/themes/derive";
import { builtInPresets } from "@/lib/themes/resolve";
import type { ThemeColors } from "@/lib/themes/schema";

import { blockHues } from "./block-color-rules";

function color(value: string | undefined): Oklch {
  const parsed = parseColor(value ?? "");
  if (!parsed) throw new Error(`unreadable color ${String(value)}`);
  return parsed;
}

/** Every pair that must read at AA: each hue's text on the card, the page, and every hue's background, and the ink on each background. */
function failingPairs(mode: PaletteMode, colors: ThemeColors): string[] {
  const tokens = blockColorTokens(mode, colors);
  const fills = blockHues.map((hue) => [`${hue} background`, color(tokens[`--block-${hue}-bg`])] as const);
  const surfaces = [["card", color(colors.card)] as const, ["page", color(colors.background)] as const, ...fills];
  const failing: string[] = [];
  for (const hue of blockHues) {
    const text = color(tokens[`--block-${hue}`]);
    for (const [name, surface] of surfaces) if (contrastRatio(text, surface) < 4.5) failing.push(`${hue} text on ${name}`);
  }
  const card = color(colors.card);
  for (const [name, fill] of fills) {
    if (contrastRatio(color(colors.foreground), fill) < 4.5) failing.push(`ink on ${name}`);
    // formatOklch rounds to three places, so allow a hair under the gap.
    if (Math.abs(fill.l - card.l) < blockFillGap - 0.002) failing.push(`${name} too close to the card`);
  }
  return failing;
}

/**
 * A preset's palette with its card at `card` lightness and its page beside
 * it, as a custom theme may set them: two surfaces on the same side, not the
 * same color. In light mode the page sits a little toward the ink (as the
 * site's page sits under its white cards); in dark mode, below the card.
 */
function withSurfaces(colors: ThemeColors, mode: PaletteMode, card: number): ThemeColors {
  const page = mode === "light" ? card - 0.05 : card - 0.08;
  return { ...colors, card: `oklch(${String(card)} 0.02 80)`, background: `oklch(${String(page)} 0.02 80)` };
}

/** A preset's palette on one surface: the page and the card are the same color, so the card alone binds the ink. */
function onOneSurface(colors: ThemeColors, card: number): ThemeColors {
  return { ...colors, card: `oklch(${String(card)} 0 0)`, background: `oklch(${String(card)} 0 0)` };
}

/**
 * The palette with its body text moved to just clear `ratio` (AA by
 * default) on both its card and its page: the darkest (or lightest) ink a
 * theme may choose.
 */
function withInkAt(colors: ThemeColors, mode: PaletteMode, ratio = 4.5): ThemeColors {
  const surfaces = [color(colors.card), color(colors.background)];
  let ink: Oklch = { ...color(colors.card), c: 0.01 };
  const step = mode === "light" ? -0.002 : 0.002;
  while (surfaces.some((surface) => contrastRatio(ink, surface) < ratio)) ink = { ...ink, l: ink.l + step };
  return { ...colors, foreground: `oklch(${ink.l.toFixed(3)} 0.01 80)` };
}

describe("blockColorTokens", () => {
  it("should keep every hue readable on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) expect(failingPairs(mode, preset.theme[mode]), `${id} ${mode}`).toEqual([]);
    }
  });

  it("should re-light the hues for a custom theme's card at the edge of what themes allow", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    expect(failingPairs("light", withSurfaces(preset.theme.light, "light", 0.9))).toEqual([]);
    expect(failingPairs("light", withSurfaces(preset.theme.light, "light", 0.75))).toEqual([]);
    expect(failingPairs("dark", withSurfaces(preset.theme.dark, "dark", 0.4))).toEqual([]);
  });

  it("should keep backgrounds readable and set apart from the card when a theme sits at both limits", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    expect(failingPairs("light", withInkAt(withSurfaces(preset.theme.light, "light", 0.9), "light"))).toEqual([]);
    expect(failingPairs("light", withInkAt(withSurfaces(preset.theme.light, "light", 0.75), "light"))).toEqual([]);
    expect(failingPairs("dark", withInkAt(withSurfaces(preset.theme.dark, "dark", 0.4), "dark"))).toEqual([]);
    expect(failingPairs("dark", withInkAt(withSurfaces(preset.theme.dark, "dark", 0.2), "dark"))).toEqual([]);
  });

  it("should keep backgrounds apart from the card when the ink is bound by the card itself", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    expect(failingPairs("light", withInkAt(onOneSurface(preset.theme.light, 0.9), "light"))).toEqual([]);
    expect(failingPairs("dark", withInkAt(onOneSurface(preset.theme.dark, 0.2), "dark"))).toEqual([]);
  });

  it("should never draw backgrounds on a white or black card itself, keeping them as far off it as the ink allows", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    for (const mode of ["light", "dark"] as const) {
      const card = mode === "light" ? 1 : 0;
      const colors = withInkAt(onOneSurface(preset.theme[mode], card), mode, 4.8);
      const tokens = blockColorTokens(mode, colors);
      for (const hue of blockHues) {
        const fill = color(tokens[`--block-${hue}-bg`]);
        expect(contrastRatio(color(colors.foreground), fill), `${mode} ${hue}`).toBeGreaterThanOrEqual(4.5);
        expect(Math.abs(fill.l - card), `${mode} ${hue}`).toBeGreaterThan(0.01);
      }
    }
  });

  it("should draw backgrounds on a white or black card itself when the ink is right at the AA floor there", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    // The documented limit (markdown-dialect.md, "Block colors"): no fill can sit off the card and keep this ink readable.
    for (const mode of ["light", "dark"] as const) {
      const card = mode === "light" ? 1 : 0;
      const colors = withInkAt(onOneSurface(preset.theme[mode], card), mode);
      const tokens = blockColorTokens(mode, colors);
      for (const hue of blockHues) {
        const fill = color(tokens[`--block-${hue}-bg`]);
        expect(contrastRatio(color(colors.foreground), fill), `${mode} ${hue}`).toBeGreaterThanOrEqual(4.5);
        expect(Math.abs(fill.l - card), `${mode} ${hue}`).toBeLessThanOrEqual(0.005);
      }
    }
  });

  it("should be part of every theme's tokens, so themed artifacts draw block colors from the theme", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    const tokens = paletteTokens("light", preset.theme.light);
    for (const hue of blockHues) {
      expect(tokens[`--block-${hue}`]).toBeDefined();
      expect(tokens[`--block-${hue}-bg`]).toBeDefined();
    }
  });
});
