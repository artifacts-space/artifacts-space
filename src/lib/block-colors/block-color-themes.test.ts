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

/** The palette with its body text moved to just clear AA on both its card and its page: the darkest (or lightest) ink a theme may choose. */
function withInkAtFloor(colors: ThemeColors, mode: PaletteMode): ThemeColors {
  const surfaces = [color(colors.card), color(colors.background)];
  let ink: Oklch = { ...color(colors.card), c: 0.01 };
  const step = mode === "light" ? -0.002 : 0.002;
  while (surfaces.some((surface) => contrastRatio(ink, surface) < 4.5)) ink = { ...ink, l: ink.l + step };
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
    expect(failingPairs("light", withInkAtFloor(withSurfaces(preset.theme.light, "light", 0.9), "light"))).toEqual([]);
    expect(failingPairs("light", withInkAtFloor(withSurfaces(preset.theme.light, "light", 0.75), "light"))).toEqual([]);
    expect(failingPairs("dark", withInkAtFloor(withSurfaces(preset.theme.dark, "dark", 0.4), "dark"))).toEqual([]);
    expect(failingPairs("dark", withInkAtFloor(withSurfaces(preset.theme.dark, "dark", 0.2), "dark"))).toEqual([]);
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
