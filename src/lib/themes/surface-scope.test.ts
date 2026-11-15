import { describe, expect, it } from "vitest";

import { blockHues } from "@/lib/block-colors/block-color-rules";

import { contrastRatio, mixOklch, paintOver, parseColor, type Oklch } from "./color";
import { blockFills, dangerHoverMix, nonTextMinimum, paletteTokens, pressedHoverMix, toneTintMax, type PaletteMode } from "./derive";
import { themePresets } from "./presets";
import { presetTheme, siteDefaultTheme } from "./resolve";
import type { Theme } from "./schema";
import { surfaceEngine, type QuietFill } from "./surface-scope";

const modes: PaletteMode[] = ["light", "dark"];
const fills: QuietFill[] = ["muted", ...blockHues];
// The accent tone is held to the status tones' rule everywhere they are.
const tones = ["info", "success", "warning", "danger", "accent"] as const;
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

  it.each(themes)("should keep a tone badge, the tone on its own tint, at 4.5:1 on the muted fill and every hue of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const tokens = paletteTokens(mode, theme[mode]);
      const surfaces: [string, Oklch][] = [["muted", color(tokens["--muted"])], ...blockFills(mode, theme[mode]).map((fill, index): [string, Oklch] => [blockHues[index] ?? "hue", fill])];
      for (const tone of tones) {
        const ink = color(tokens[`--tone-${tone}`]);
        for (const [name, surface] of surfaces) {
          expect(contrastRatio(ink, paintOver(ink, toneTintMax, surface)), `${mode} ${tone} badge on ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
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

  it.each(themes)("should keep body text, muted text, every status tone, and every tone badge at 4.5:1 on the primary surface of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const scope = surfaceEngine(theme, mode, "test").strong("primary");
      // On the site palette primary is the inverse surface: the site CSS holds the other mode's own tokens, so no value is set.
      if (Object.keys(scope.style).length === 0) continue;
      const page = color(scope.style["--background"]);
      expect(scope.style["--background"]).toBe(theme[mode].accent);
      for (const name of inks) expect(contrastRatio(color(scope.style[name]), page), `${mode} ${name}`).toBeGreaterThanOrEqual(4.5);
      for (const tone of tones) {
        const ink = color(scope.style[`--tone-${tone}`]);
        expect(contrastRatio(ink, paintOver(ink, toneTintMax, page)), `${mode} ${tone} badge`).toBeGreaterThanOrEqual(4.5);
      }
      // A default button inside swaps the two, so it shows against the accent.
      expect(scope.style["--primary"]).toBe(theme[mode].accentForeground);
      expect(scope.style["--primary-foreground"]).toBe(theme[mode].accent);
    }
  });

  it.each(themes)("should keep every chart color and a diagram's lines at 3:1 on the primary surface of the %s preset, where a theme's chart colors sit beside its accent", (_id, theme) => {
    for (const mode of modes) {
      const scope = surfaceEngine(theme, mode, "test").strong("primary");
      if (Object.keys(scope.style).length === 0) continue;
      const page = color(scope.style["--background"]);
      for (let index = 1; index <= 8; index += 1) {
        expect(contrastRatio(color(scope.style[`--series-${String(index)}`]), page), `${mode} series ${String(index)}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio(color(scope.style["--diagram-line"]), page), `${mode} diagram line`).toBeGreaterThanOrEqual(3);
    }
  });

  it("should hand back the same scope when a view asks for a surface twice", () => {
    const engine = surfaceEngine(presetTheme("ocean") ?? siteDefaultTheme(), null, "ocean");
    expect(engine.strong("primary")).toBe(engine.strong("primary"));
    expect(engine.quietInk("blue")).toBe(engine.quietInk("blue"));
  });
});

describe("the mode inside a primary surface", () => {
  const site = siteDefaultTheme();
  const darkAccent = { accent: "oklch(0.35 0.12 255)", accentForeground: "oklch(0.98 0.01 255)" };
  const lightAccent = { accent: "oklch(0.86 0.1 255)", accentForeground: "oklch(0.2 0.03 255)" };
  /** A theme with the given accent on each side; the rest is the site palette with a tinted page, so it is not the site's. */
  const themed = (light: typeof darkAccent, dark: typeof darkAccent): Theme => ({
    ...site,
    light: { ...site.light, background: "oklch(0.97 0.02 250)", ...light },
    dark: { ...site.dark, background: "oklch(0.2 0.02 250)", ...dark },
  });
  const crossed = themed(darkAccent, lightAccent);
  const straight = themed(lightAccent, darkAccent);
  const bothLight = themed(lightAccent, lightAccent);

  it("should pin dark inside when a pinned light theme has a dark accent, and light when a pinned dark theme has a light accent", () => {
    const inLight = surfaceEngine(crossed, "light", "t").strong("primary");
    expect(inLight.className).toBe("dark");
    expect(inLight.inner).toMatchObject({ mode: "dark", flipped: false });
    expect(inLight.style["--background"]).toBe(darkAccent.accent);
    const inDark = surfaceEngine(crossed, "dark", "t").strong("primary");
    expect(inDark.className).toBe("light");
    expect(inDark.inner).toMatchObject({ mode: "light", flipped: false });
    expect(inDark.style["--background"]).toBe(lightAccent.accent);
  });

  it("should flip the mode inside when the theme follows the reader and each side's accent is of the other mode", () => {
    const scope = surfaceEngine(crossed, null, "t").strong("primary");
    expect(scope.className).toBe("theme-invert");
    expect(scope.inner).toMatchObject({ mode: null, flipped: true });
    // Inside `theme-invert` the color-scheme is the other one, so a light reader gets the second value: the light side's dark accent.
    expect(scope.style["--background"]).toBe(`light-dark(${lightAccent.accent}, ${darkAccent.accent})`);
    expect(scope.style["--foreground"]).toBe(`light-dark(${lightAccent.accentForeground}, ${darkAccent.accentForeground})`);
  });

  it("should keep the theme's mode inside when each side's accent is of its own mode, pinned or following the reader", () => {
    const followed = surfaceEngine(straight, null, "t").strong("primary");
    expect(followed.className).toBeNull();
    expect(followed.inner).toMatchObject({ mode: null, flipped: false });
    expect(followed.style["--background"]).toBe(`light-dark(${lightAccent.accent}, ${darkAccent.accent})`);
    for (const mode of modes) {
      const pinned = surfaceEngine(straight, mode, "t").strong("primary");
      expect(pinned.className, mode).toBeNull();
      expect(pinned.inner, mode).toMatchObject({ mode, flipped: false });
    }
  });

  it("should tell views the accent's mode when both sides have a light accent, for a light reader and a dark one", () => {
    const followed = surfaceEngine(bothLight, null, "t").strong("primary");
    expect(followed.inner).toMatchObject({ mode: "light", flipped: false });
    // The color-scheme stays the reader's, since it picks each side's values.
    expect(followed.className).toBeNull();
    const pinnedDark = surfaceEngine(bothLight, "dark", "t").strong("primary");
    expect(pinnedDark.className).toBe("light");
    expect(pinnedDark.inner).toMatchObject({ mode: "light", flipped: false });
  });

  it("should give the surface a key of its own, so views that draw their own colors redraw inside it", () => {
    const engine = surfaceEngine(crossed, null, "t");
    expect(engine.strong("primary").inner.key).toBe("t:primary");
    expect(engine.strong("inverse").inner.key).toBe("t:inverse");
  });

  it("should report the other mode inside an inverse surface, pinned and following the reader", () => {
    expect(surfaceEngine(crossed, "light", "t").strong("inverse").inner).toMatchObject({ mode: "dark", flipped: false });
    expect(surfaceEngine(crossed, null, "t").strong("inverse").inner).toMatchObject({ mode: null, flipped: true });
  });
});

describe("a status badge on a primary surface", () => {
  const site = siteDefaultTheme();
  // Each accent holds its label at 4.5:1, as the theme rules ask, but leaves no color that reads on a 12% tint of itself.
  const midDark = { accent: "oklch(0.546 0.215 262.9)", accentForeground: "oklch(1 0 0)" };
  const midLight = { accent: "oklch(0.56 0.1 150)", accentForeground: "oklch(0 0 0)" };
  const theme: Theme = {
    ...site,
    light: { ...site.light, background: "oklch(0.97 0.02 250)", ...midDark },
    dark: { ...site.dark, background: "oklch(0.2 0.02 250)", ...midLight },
  };

  it.each([
    ["a light label", "light", midDark],
    ["a dark label", "dark", midLight],
  ] as const)("should step the fill away from %s, keeping the accent's hue, until the label and every tone hold a badge", (_name, mode, accent) => {
    const before = color(accent.accent);
    const label = color(accent.accentForeground);
    expect(contrastRatio(label, before)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(label, paintOver(label, toneTintMax, before))).toBeLessThan(4.5);
    const scope = surfaceEngine(theme, mode, "t").strong("primary");
    const fill = color(scope.style["--background"]);
    expect(fill.h).toBeCloseTo(before.h, 1);
    expect(fill.c).toBeCloseTo(before.c, 3);
    expect(Math.abs(fill.l - label.l)).toBeGreaterThan(Math.abs(before.l - label.l));
    for (const name of ["--foreground", ...tones.map((tone) => `--tone-${tone}`)]) {
      const ink = color(scope.style[name]);
      expect(contrastRatio(ink, fill), `${name} as text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, paintOver(ink, toneTintMax, fill)), `${name} as a badge`).toBeGreaterThanOrEqual(4.5);
    }
    // A default button inside still swaps the pair.
    expect(scope.style["--primary-foreground"]).toBe(scope.style["--background"]);
  });

  it.each(themes)("should leave the accent of the %s preset as written, where its label already holds a badge", (_id, preset) => {
    for (const mode of modes) {
      const scope = surfaceEngine(preset, mode, "t").strong("primary");
      if (Object.keys(scope.style).length > 0) expect(scope.style["--background"], mode).toBe(preset[mode].accent);
    }
  });
});

describe("a danger Button: the danger tone as the fill, the page color as its label", () => {
  /** The label's contrast on the fill at rest, and on the fill under the pointer. */
  function reads(tokens: { label: Oklch; fill: Oklch; text: Oklch }): { rest: number; hover: number } {
    return { rest: contrastRatio(tokens.label, tokens.fill), hover: contrastRatio(tokens.label, mixOklch(tokens.fill, tokens.text, dangerHoverMix)) };
  }

  it.each(themes)("should hold its label at 4.5:1 and lose nothing under the pointer on the page, the muted fill, and every hue of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const tokens = paletteTokens(mode, theme[mode]);
      const engine = surfaceEngine(theme, mode, "test");
      // The page, a card, and an unpainted Box use the palette's own tone; a quiet fill may re-light it.
      const places: [string, Record<string, string>][] = [["page", {}], ...fills.map((fill): [string, Record<string, string>] => [fill, engine.quietInk(fill)])];
      for (const [place, style] of places) {
        const { rest, hover } = reads({ label: color(tokens["--background"]), fill: resolved(style, tokens, "--tone-danger"), text: resolved(style, tokens, "--foreground") });
        expect(rest, `${mode} on ${place}`).toBeGreaterThanOrEqual(4.5);
        expect(hover, `${mode} on ${place}, under the pointer`).toBeGreaterThanOrEqual(rest - 0.001);
      }
    }
  });

  it.each(themes)("should hold its label at 4.5:1 and lose nothing under the pointer on the primary surface of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const scope = surfaceEngine(theme, mode, "test").strong("primary");
      // On the site palette primary is the inverse surface: the other mode's own palette, which the test above reads.
      if (Object.keys(scope.style).length === 0) continue;
      const { rest, hover } = reads({ label: color(scope.style["--background"]), fill: color(scope.style["--tone-danger"]), text: color(scope.style["--foreground"]) });
      expect(rest, mode).toBeGreaterThanOrEqual(4.5);
      expect(hover, `${mode}, under the pointer`).toBeGreaterThanOrEqual(rest - 0.001);
    }
  });
});

describe("a pressed Button: the text color as the fill, the page color as its label and inner line", () => {
  /** The label on the fill, and the fill's edge on the surface, at rest and under the pointer. */
  function reads(tokens: { label: Oklch; fill: Oklch; surface: Oklch }) {
    const hover = mixOklch(tokens.fill, tokens.label, pressedHoverMix);
    return {
      label: { rest: contrastRatio(tokens.label, tokens.fill), hover: contrastRatio(tokens.label, hover) },
      edge: { rest: contrastRatio(tokens.fill, tokens.surface), hover: contrastRatio(hover, tokens.surface) },
    };
  }

  function expectReads(tokens: { label: Oklch; fill: Oklch; surface: Oklch }, where: string) {
    const { label, edge } = reads(tokens);
    expect(label.rest, `${where}: label`).toBeGreaterThanOrEqual(4.5);
    expect(label.hover, `${where}: label under the pointer`).toBeGreaterThanOrEqual(4.5);
    expect(edge.rest, `${where}: edge on the surface`).toBeGreaterThanOrEqual(nonTextMinimum);
    expect(edge.hover, `${where}: edge on the surface under the pointer`).toBeGreaterThanOrEqual(nonTextMinimum);
  }

  it.each(themes)("should hold its label at 4.5:1 and its edge at 3:1, at rest and under the pointer, on the page, the card, the muted fill, and every hue of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const tokens = paletteTokens(mode, theme[mode]);
      const engine = surfaceEngine(theme, mode, "test");
      const hueFills = blockFills(mode, theme[mode]);
      const places: [string, Record<string, string>, Oklch][] = [
        ["page", {}, color(tokens["--background"])],
        ["card", {}, color(tokens["--card"])],
        ...fills.map((fill, index): [string, Record<string, string>, Oklch] => [fill, engine.quietInk(fill), fill === "muted" ? color(tokens["--muted"]) : (hueFills[index - 1] ?? color(tokens["--card"]))]),
      ];
      for (const [place, style, surface] of places) {
        expectReads({ label: color(tokens["--background"]), fill: resolved(style, tokens, "--foreground"), surface }, `${mode} on ${place}`);
      }
    }
  });

  it.each(themes)("should hold its label at 4.5:1 and its edge at 3:1, at rest and under the pointer, on the primary surface of the %s preset", (_id, theme) => {
    for (const mode of modes) {
      const scope = surfaceEngine(theme, mode, "test").strong("primary");
      // On the site palette primary is the inverse surface: the other mode's own palette, which the test above reads.
      if (Object.keys(scope.style).length === 0) continue;
      const page = color(scope.style["--background"]);
      expectReads({ label: page, fill: color(scope.style["--foreground"]), surface: page }, mode);
    }
  });

  it("should fail the rule when the hover step is so large that the label runs out of contrast", () => {
    const tokens = paletteTokens("light", siteDefaultTheme().light);
    const label = color(tokens["--background"]);
    const fill = color(tokens["--foreground"]);
    expect(contrastRatio(label, mixOklch(fill, label, 0.9))).toBeLessThan(4.5);
  });
});
