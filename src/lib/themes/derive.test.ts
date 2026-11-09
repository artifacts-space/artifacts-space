import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, normalizeColor, parseColor, type Oklch } from "./color";
import { paletteTokens, ringTokens, type PaletteMode } from "./derive";
import { builtInPresets } from "./resolve";
import type { ThemeColors } from "./schema";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The site's `--ring` in one mode, from the first block whose selector starts with `selector`. */
function siteRing(selector: string): string | null {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`globals.css has no block starting "${selector}": the test's selector drifted`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const value = /^\s*--ring:\s*([^;]+);/m.exec(body)?.[1];
  return value ? normalizeColor(value.trim()) : null;
}

const site: Record<PaletteMode, string | null> = { light: siteRing(":root,\n.light,"), dark: siteRing(".dark,\n:root:not(.dark)") };

function color(value: string | undefined): Oklch {
  const parsed = parseColor(value ?? "");
  if (!parsed) throw new Error(`unreadable color ${String(value)}`);
  return parsed;
}

function defaultColors(mode: PaletteMode): ThemeColors {
  const preset = builtInPresets().get("default");
  if (!preset) throw new Error("default preset missing");
  return preset.theme[mode];
}

/** The derived ring's contrast on the palette's card and page. */
function ringContrast(mode: PaletteMode, colors: ThemeColors): { card: number; page: number; ring: Oklch } {
  const ring = color(ringTokens(mode, colors)["--ring"]);
  return { ring, card: contrastRatio(ring, color(colors.card)), page: contrastRatio(ring, color(colors.background)) };
}

describe("the themed focus ring", () => {
  it("should equal the site ring in globals.css when derived from the Default preset", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(site[mode], `${mode} site --ring`).not.toBeNull();
      expect(ringTokens(mode, defaultColors(mode))["--ring"], mode).toBe(site[mode]);
    }
  });

  it("should reach 3:1 on the card and the page, keeping the site blue, on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const ring = color(tokens["--ring"]);
        expect(contrastRatio(ring, color(tokens["--card"])), `${id} ${mode} ring on the card`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(ring, color(tokens["--background"])), `${id} ${mode} ring on the page`).toBeGreaterThanOrEqual(3);
        // Built-in presets already pass with the site blue, so none should re-light it.
        expect(tokens["--ring"], `${id} ${mode} keeps the site ring`).toBe(site[mode]);
      }
    }
  });

  it("should re-light the brand blue to 3:1 when a card sits at the edge of each mode", () => {
    // The darkest light card and the lightest dark card validation allows (modeLightness), plain and blue-tinted.
    const edges: Record<PaletteMode, string[]> = {
      light: ["oklch(0.7 0 0)", "oklch(0.72 0.05 262)"],
      dark: ["oklch(0.4 0 0)", "oklch(0.4 0.08 262)"],
    };
    for (const mode of ["light", "dark"] as const) {
      for (const card of edges[mode]) {
        const { ring, card: onCard, page } = ringContrast(mode, { ...defaultColors(mode), card, background: card });
        expect(onCard, `${mode} card ${card}: ring on the card`).toBeGreaterThanOrEqual(3);
        expect(page, `${mode} card ${card}: ring on the page`).toBeGreaterThanOrEqual(3);
        expect(Math.abs(ring.h - 262), `${mode} card ${card}: ring keeps the brand hue`).toBeLessThan(0.5);
      }
    }
  });

  it("should move the ring when the site blue falls under 3:1 on a theme's card", () => {
    // The site's light blue reads at about 2.4:1 on a 0.72 card, so the derived ring must differ from it.
    const colors = { ...defaultColors("light"), card: "oklch(0.72 0.05 262)", background: "oklch(0.72 0.05 262)" };
    expect(contrastRatio(color(site.light ?? ""), color(colors.card))).toBeLessThan(3);
    expect(ringTokens("light", colors)["--ring"]).not.toBe(site.light);
  });
});
