import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor, type Oklch } from "@/lib/themes/color";
import { blockColorTokens, paletteTokens, type PaletteMode } from "@/lib/themes/derive";
import { builtInPresets } from "@/lib/themes/resolve";
import type { ThemeColors } from "@/lib/themes/schema";

import { blockHues } from "./block-color-rules";

function color(value: string | undefined): Oklch {
  const parsed = parseColor(value ?? "");
  if (!parsed) throw new Error(`unreadable color ${String(value)}`);
  return parsed;
}

/** Every pair that must read at AA: each hue's text on the card, the page, and its own background, and the ink on each background. */
function failingPairs(mode: PaletteMode, colors: ThemeColors): string[] {
  const tokens = blockColorTokens(mode, colors);
  const failing: string[] = [];
  for (const hue of blockHues) {
    const text = color(tokens[`--block-${hue}`]);
    const fill = color(tokens[`--block-${hue}-bg`]);
    const pairs: [string, Oklch, Oklch][] = [
      ["text on card", text, color(colors.card)],
      ["text on page", text, color(colors.background)],
      ["text on its background", text, fill],
      ["ink on background", color(colors.foreground), fill],
    ];
    for (const [name, a, b] of pairs) if (contrastRatio(a, b) < 4.5) failing.push(`${hue} ${name}`);
  }
  return failing;
}

/** A preset's palette with its card and page moved to `lightness`, as a custom theme may. */
function withSurface(colors: ThemeColors, lightness: number): ThemeColors {
  const surface = `oklch(${String(lightness)} 0.02 80)`;
  return { ...colors, card: surface, background: surface };
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
    expect(failingPairs("light", withSurface(preset.theme.light, 0.9))).toEqual([]);
    expect(failingPairs("light", withSurface(preset.theme.light, 0.7))).toEqual([]);
    expect(failingPairs("dark", withSurface(preset.theme.dark, 0.4))).toEqual([]);
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
