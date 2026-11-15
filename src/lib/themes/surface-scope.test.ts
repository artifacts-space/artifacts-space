import { describe, expect, it } from "vitest";

import { blockHues } from "@/lib/block-colors/block-color-rules";

import { contrastRatio, parseColor, type Oklch } from "./color";
import { blockFills, paletteTokens, type PaletteMode } from "./derive";
import { themePresets } from "./presets";
import { presetTheme, siteDefaultTheme } from "./resolve";
import type { Theme } from "./schema";
import { surfaceEngine, type QuietFill } from "./surface-scope";

const modes: PaletteMode[] = ["light", "dark"];
const fills: QuietFill[] = ["muted", ...blockHues];
const tones = ["info", "success", "warning", "danger"] as const;
const inks = ["--foreground", "--muted-foreground", ...tones.map((tone) => `--tone-${tone}`)];

function color(value: string | undefined): Oklch {
  const parsed = value ? parseColor(value) : null;
  if (!parsed) throw new Error(`not a color: ${String(value)}`);
  return parsed;
}

const themes: [string, Theme][] = themePresets.map((preset) => [preset.id, presetTheme(preset.id) ?? siteDefaultTheme()]);

/** A token as the scope leaves it: the scope's own value when it sets one, else the palette's. */
function resolved(style: Record<string, string>, tokens: Record<string, string>, name: string): Oklch {
  return color(style[name] ?? tokens[name]);
}

describe("quiet surfaces", () => {
  it.each(themes)("should keep body text, muted text, and every status tone at 4.5:1 on the muted fill and every hue of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const tokens = paletteTokens(mode, theme[mode]);
      const engine = surfaceEngine(theme, mode, "test");
      const hueFills = blockFills(mode, theme[mode]);
      fills.forEach((fill, index) => {
        const surface = fill === "muted" ? color(tokens["--muted"]) : (hueFills[index - 1] ?? color(tokens["--card"]));
        const style = engine.quietInk(fill);
        for (const name of inks) {
          expect(contrastRatio(resolved(style, tokens, name), surface), `${mode} ${name} on ${fill}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  });

  it("should set nothing on the site palette when its text already reads on every fill", () => {
    const engine = surfaceEngine(siteDefaultTheme(), null, "site");
    for (const fill of fills) expect(engine.quietInk(fill), fill).toEqual({});
  });

  it("should re-light muted text when a theme leaves it under 4.5:1 on a fill", () => {
    const site = siteDefaultTheme();
    // Muted text at the AA floor on the card is under it on the quiet fill, which leans toward the ink.
    const theme: Theme = { ...site, light: { ...site.light, background: "oklch(0.97 0.02 250)", mutedForeground: "oklch(0.556 0.01 65)" } };
    const tokens = paletteTokens("light", theme.light);
    expect(contrastRatio(color(tokens["--muted-foreground"]), color(tokens["--muted"]))).toBeLessThan(4.5);
    const style = surfaceEngine(theme, "light", "test").quietInk("muted");
    expect(contrastRatio(color(style["--muted-foreground"]), color(tokens["--muted"]))).toBeGreaterThanOrEqual(4.5);
    expect(style).not.toHaveProperty("--foreground");
  });
});

describe("strong surfaces", () => {
  it("should use the site's own inverse class and set no values when the theme is the site palette", () => {
    const scope = surfaceEngine(siteDefaultTheme(), null, "site").strong("inverse");
    expect(scope.className).toBe("theme-invert");
    expect(scope.style).toEqual({});
    expect(scope.inner).toMatchObject({ mode: null, flipped: true });
  });

  it("should treat primary as inverse on the site palette, whose accent is its ink", () => {
    const engine = surfaceEngine(siteDefaultTheme(), null, "site");
    expect(engine.strong("primary").className).toBe("theme-invert");
  });

  it("should pin the other mode with its class and plain values when the scope is pinned", () => {
    const theme = presetTheme("ocean") ?? siteDefaultTheme();
    const scope = surfaceEngine(theme, "light", "ocean").strong("inverse");
    expect(scope.className).toBe("dark");
    expect(scope.style).toEqual(paletteTokens("dark", theme.dark));
    expect(scope.inner.mode).toBe("dark");
  });

  it("should set the theme's own light-dark values again when an inverse surface follows the reader", () => {
    const theme = presetTheme("ocean") ?? siteDefaultTheme();
    const scope = surfaceEngine(theme, null, "ocean").strong("inverse");
    expect(scope.className).toBe("theme-invert");
    expect(scope.style["--background"]).toBe(`light-dark(${theme.light.background}, ${theme.dark.background})`);
    expect(scope.inner).toMatchObject({ mode: null, flipped: true });
  });

  it.each(themes)("should keep body text, muted text, and every status tone at 4.5:1 on the primary surface of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const scope = surfaceEngine(theme, mode, "test").strong("primary");
      // On the site palette primary is the inverse surface: the other mode's own tokens, already held by the theme rules.
      if (scope.className !== null) continue;
      const page = color(scope.style["--background"]);
      expect(scope.style["--background"]).toBe(theme[mode].accent);
      for (const name of inks) expect(contrastRatio(color(scope.style[name]), page), `${mode} ${name}`).toBeGreaterThanOrEqual(4.5);
      // A default button inside swaps the two, so it shows against the accent.
      expect(scope.style["--primary"]).toBe(theme[mode].accentForeground);
      expect(scope.style["--primary-foreground"]).toBe(theme[mode].accent);
    }
  });

  it("should hand back the same scope when a view asks for a surface twice", () => {
    const engine = surfaceEngine(presetTheme("ocean") ?? siteDefaultTheme(), null, "ocean");
    expect(engine.strong("primary")).toBe(engine.strong("primary"));
    expect(engine.quietInk("blue")).toBe(engine.quietInk("blue"));
  });
});
