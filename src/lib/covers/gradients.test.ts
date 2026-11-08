import { describe, expect, it } from "vitest";

import { parseColor } from "@/lib/themes/color";
import { themePresets } from "@/lib/themes/presets";
import { presetTheme } from "@/lib/themes/resolve";

import { coverGradient, coverGradientCss, coverGradientHex, coverGradients } from "./gradients";

/** Literal colors a component must never carry: hex, rgb(), hsl(), oklch(). */
const literalColor = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i;

describe("cover gradients", () => {
  it("should have unique ids and look each one up by id", () => {
    const ids = coverGradients.map((gradient) => gradient.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(coverGradient(id)?.id).toBe(id);
    expect(coverGradient("neon")).toBeUndefined();
  });

  it("should build the CSS only from theme custom properties, never a literal color", () => {
    for (const gradient of coverGradients) {
      const css = coverGradientCss(gradient);
      expect(css).toMatch(/^linear-gradient\(\d+deg, color-mix\(in oklab, var\(--[a-z0-9-]+\) \d+%, var\(--background\)\)/);
      expect(css).not.toMatch(literalColor);
    }
  });

  it("should stay a soft tint in every preset, light near paper and dark near ink, when drawn as hex", () => {
    const ends = themePresets.flatMap((preset) => {
      const theme = presetTheme(preset.id);
      if (!theme) throw new Error(`${preset.id} missing`);
      return coverGradients.flatMap((gradient) => [
        { mode: "light", hex: coverGradientHex(gradient, theme.light) },
        { mode: "dark", hex: coverGradientHex(gradient, theme.dark) },
      ]);
    });
    for (const { mode, hex } of ends) {
      if (!hex) throw new Error("a gradient did not draw");
      const colors = [parseColor(hex.from), parseColor(hex.to)];
      for (const color of colors) {
        if (!color) throw new Error("hex did not parse");
        if (mode === "light") expect(color.l).toBeGreaterThan(0.8);
        else expect(color.l).toBeLessThan(0.4);
        expect(color.c).toBeLessThan(0.08);
      }
    }
  });
});
