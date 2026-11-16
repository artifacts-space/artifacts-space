import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastIssues } from "./contrast";
import { mentionTokens, paletteTokens, seriesTokens, switchOffHover, switchOnHover, switchTokens, syntaxMinimum, syntaxTokens, toneTintMax, toneTokens } from "./derive";
import { contrastRatio, mixOklch, normalizeColor, paintOver, parseColor, type Oklch } from "./color";
import { themePresets } from "./presets";
import { builtInPresets } from "./resolve";
import { parseTheme, type ThemeColors } from "./schema";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--name: value` declarations of the first block whose selector starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const entries = [...body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()] as const);
  return new Map(entries);
}

const site = { light: block(":root,\n.light,"), dark: block(".dark,\n:root:not(.dark)") };

function siteDefaultColors(mode: "light" | "dark") {
  const preset = builtInPresets().get("default");
  if (!preset) throw new Error("default preset missing");
  return preset.theme[mode];
}

function siteColor(mode: "light" | "dark", name: string): string | null {
  const value = site[mode].get(name);
  return value ? normalizeColor(value) : null;
}

/**
 * Every pair a switch must keep at 3:1, at rest and hovered. The hover tints
 * mirror switch.tsx: on mixes toward the ink in light and toward the page in
 * dark; off mixes toward the ink.
 */
function switchPairs(mode: "light" | "dark", colors: ThemeColors): { name: string; a: Oklch; b: Oklch }[] {
  const tokens = switchTokens(mode, colors);
  const color = (value: string | undefined) => {
    const parsed = parseColor(value ?? "");
    if (!parsed) throw new Error(`unreadable color ${String(value)}`);
    return parsed;
  };
  const [card, ink, page] = [colors.card, colors.foreground, colors.background].map(color);
  const [on, onThumb, off, offThumb] = ["--switch-on", "--switch-on-thumb", "--switch-off", "--switch-off-thumb"].map((name) => color(tokens[name]));
  if (!card || !ink || !page || !on || !onThumb || !off || !offThumb) throw new Error("missing switch colors");
  const onHover = mixOklch(on, mode === "light" ? ink : page, switchOnHover);
  const offHover = mixOklch(off, ink, switchOffHover);
  return [
    { name: "on track on the card", a: on, b: card },
    { name: "hovered on track on the card", a: onHover, b: card },
    { name: "on track on the page", a: on, b: page },
    { name: "hovered on track on the page", a: onHover, b: page },
    { name: "on thumb on its track", a: onThumb, b: on },
    { name: "on thumb on its hovered track", a: onThumb, b: onHover },
    { name: "off thumb on its track", a: offThumb, b: off },
    { name: "off thumb on its hovered track", a: offThumb, b: offHover },
  ];
}

describe("theme presets", () => {
  it("should give every preset a unique kebab-case id when listed", () => {
    const ids = themePresets.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
    expect(ids[0]).toBe("default");
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.length).toBeLessThanOrEqual(8);
  });

  it("should pass validation and contrast in both modes for every preset", () => {
    for (const preset of themePresets) {
      const result = parseTheme(preset.theme);
      expect(result.ok ? [] : result.issues, preset.id).toEqual([]);
      if (result.ok) expect(contrastIssues(result.theme), preset.id).toEqual([]);
    }
  });

  it("should keep code syntax readable on every preset's code surface in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const code = parseColor(tokens["--code"] ?? "");
        if (!code) throw new Error("no code surface");
        for (const [name, value] of Object.entries(syntaxTokens(mode, code))) {
          const color = parseColor(value);
          expect(color && contrastRatio(color, code), `${id} ${mode} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("should keep inline code readable and set apart from the page on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const inline = parseColor(tokens["--code-inline"] ?? "");
        const foreground = parseColor(tokens["--foreground"] ?? "");
        const background = parseColor(tokens["--background"] ?? "");
        if (!inline || !foreground || !background) throw new Error(`${id} ${mode}: missing inline code tokens`);
        expect(contrastRatio(foreground, inline), `${id} ${mode} text on inline code`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(inline, background), `${id} ${mode} inline code on the page`).toBeGreaterThan(1.05);
      }
    }
  });

  it("should keep secondary text, such as a tab that is not selected, at 4.5:1 on the page, the card, and every quiet fill on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const quiet = parseColor(tokens["--muted-foreground"] ?? "");
        if (!quiet) throw new Error(`${id} ${mode}: missing --muted-foreground`);
        // The quiet fills the tone and chart rules read: a highlighted menu row is --accent, the darkest of them.
        for (const surface of ["--background", "--card", "--secondary", "--muted", "--accent"]) {
          const fill = parseColor(tokens[surface] ?? "");
          if (!fill) throw new Error(`${id} ${mode}: missing ${surface}`);
          expect(contrastRatio(quiet, fill), `${id} ${mode} secondary text on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("should keep @mention chips readable and set apart from the card on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const card = parseColor(tokens["--card"] ?? "");
        if (!card) throw new Error(`${id} ${mode}: no card`);
        for (const chip of ["--mention", "--mention-agent"]) {
          const background = parseColor(tokens[chip] ?? "");
          const ink = parseColor(tokens[`${chip}-foreground`] ?? "");
          if (!background || !ink) throw new Error(`${id} ${mode}: missing ${chip} tokens`);
          expect(contrastRatio(ink, background), `${id} ${mode} ${chip} text`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(background, card), `${id} ${mode} ${chip} on the card`).toBeGreaterThan(1.05);
        }
      }
    }
  });

  it("should start @mention chip ink from the site's chip colors in globals.css when deriving it", () => {
    for (const mode of ["light", "dark"] as const) {
      const tokens = mentionTokens(mode, siteDefaultColors(mode));
      for (const chip of ["--mention", "--mention-agent"]) {
        const ink = parseColor(siteColor(mode, `${chip}-foreground`) ?? "");
        const derived = parseColor(tokens[`${chip}-foreground`] ?? "");
        expect(ink && derived && Math.abs(ink.h - derived.h), `${mode} ${chip} hue`).toBeLessThan(0.5);
      }
    }
  });

  it("should keep switches at 3:1, at rest and hovered, for the on track on the card and each thumb on its track on every preset in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        for (const pair of switchPairs(mode, preset.theme[mode])) {
          expect(contrastRatio(pair.a, pair.b), `${id} ${mode} ${pair.name}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("should keep switches at 3:1 at rest and hovered when a card sits at the edge of each mode", () => {
    const edgeCards = { light: ["oklch(0.7 0 0)", "oklch(1 0 0)", "oklch(0.8 0.08 150)"], dark: ["oklch(0.4 0 0)", "oklch(0.12 0 0)", "oklch(0.35 0.08 150)"] } as const;
    for (const mode of ["light", "dark"] as const) {
      for (const card of edgeCards[mode]) {
        const label = `${mode} card ${card}`;
        for (const pair of switchPairs(mode, { ...siteDefaultColors(mode), card })) {
          expect(contrastRatio(pair.a, pair.b), `${label}: ${pair.name}`).toBeGreaterThanOrEqual(3);
        }
        // The thumb is the site's white, or the card's own color on a dark card too light for white; never a grey in between.
        const thumb = switchTokens(mode, { ...siteDefaultColors(mode), card })["--switch-on-thumb"];
        expect([siteColor(mode, "--switch-on-thumb"), card], `${label}: on thumb`).toContain(thumb);
        if (mode === "light" || card === "oklch(0.12 0 0)") expect(thumb, `${label}: on thumb`).toBe(siteColor(mode, "--switch-on-thumb"));
      }
    }
  });

  it("should show off at least one pairing beyond Geist when listing presets", () => {
    const fonts = themePresets.flatMap((preset) => Object.values(preset.theme.fonts ?? {}));
    expect(fonts).toEqual(expect.arrayContaining(["instrument-serif", "source-serif-4", "roboto"]));
  });
});

describe("the Default preset", () => {
  const preset = builtInPresets().get("default");

  it("should reproduce the site tokens in globals.css when compared value by value", () => {
    if (!preset) throw new Error("default preset missing");
    for (const mode of ["light", "dark"] as const) {
      const colors = preset.theme[mode];
      expect(colors.background).toBe(siteColor(mode, "--background"));
      expect(colors.foreground).toBe(siteColor(mode, "--foreground"));
      expect(colors.mutedForeground).toBe(siteColor(mode, "--muted-foreground"));
      expect(colors.card).toBe(siteColor(mode, "--card"));
      expect(colors.accent).toBe(siteColor(mode, "--primary"));
      expect(colors.accentForeground).toBe(siteColor(mode, "--primary-foreground"));
      expect(colors.chart).toEqual(Array.from({ length: 8 }, (_, index) => siteColor(mode, `--series-${String(index + 1)}`)));
    }
    for (const mode of ["light", "dark"] as const) {
      expect(paletteTokens(mode, preset.theme[mode])["--code-inline"], `${mode} --code-inline`).toBe(siteColor(mode, "--code-inline"));
    }
    expect(preset.theme.fonts).toEqual({ body: "geist-sans", heading: "geist-sans", mono: "geist-mono" });
    expect(preset.theme.radius).toBe("md");
    expect(site.light.get("--radius")).toBe("0.375rem");
  });

  it("should keep the site switches at 3:1 for the on track on the card and each thumb on its track in globals.css", () => {
    for (const mode of ["light", "dark"] as const) {
      const [card, on, onThumb, off, offThumb] = ["--card", "--switch-on", "--switch-on-thumb", "--switch-off", "--switch-off-thumb"].map((name) => parseColor(siteColor(mode, name) ?? ""));
      if (!card || !on || !onThumb || !off || !offThumb) throw new Error(`${mode}: missing site switch tokens`);
      expect(contrastRatio(on, card), `${mode} on track on the card`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(onThumb, on), `${mode} on thumb on its track`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(offThumb, off), `${mode} off thumb on its track`).toBeGreaterThanOrEqual(3);
    }
  });

  it("should reproduce the site switch tokens in globals.css when deriving them from the Default preset", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const [name, value] of Object.entries(switchTokens(mode, siteDefaultColors(mode)))) {
        expect(value, `${mode} ${name}`).toBe(siteColor(mode, name));
      }
    }
  });

  it("should start syntax colors from the site palette when they already pass on the site code surface", () => {
    for (const mode of ["light", "dark"] as const) {
      const code = parseColor(site[mode].get("--code") ?? "");
      if (!code) throw new Error("no site code surface");
      for (const [name, derived] of Object.entries(syntaxTokens(mode, code))) {
        const original = siteColor(mode, name);
        const color = parseColor(original ?? "");
        // Every site syntax color, comments and punctuation included, reads at AA on the site's code surface, so none is re-lit.
        expect(color && contrastRatio(color, code), `${mode} ${name}`).toBeGreaterThanOrEqual(4.55);
        expect(derived, `${mode} ${name}`).toBe(original);
      }
    }
  });
});

describe("status tones", () => {
  it("should hold every syntax role to 4.5:1 when listing the minimums", () => {
    expect(new Set(Object.values(syntaxMinimum))).toEqual(new Set([4.5]));
  });

  it("should reproduce the site tones in globals.css when deriving them from the Default preset", () => {
    const preset = builtInPresets().get("default");
    if (!preset) throw new Error("default preset missing");
    for (const mode of ["light", "dark"] as const) {
      for (const [name, value] of Object.entries(toneTokens(mode, preset.theme[mode]))) {
        expect(value, `${mode} ${name}`).toBe(siteColor(mode, name));
      }
    }
  });

  it("should give the site palette an accent tone of its own in the blue of --brand, not its ink, and leave --brand as it is", () => {
    for (const mode of ["light", "dark"] as const) {
      const accent = parseColor(siteColor(mode, "--tone-accent") ?? "");
      if (!accent) throw new Error(`${mode} has no --tone-accent`);
      expect(accent.h, mode).toBeCloseTo(262, 0);
      expect(accent.c, mode).toBeGreaterThan(0.1);
      expect(siteColor(mode, "--tone-accent"), mode).not.toBe(siteColor(mode, "--foreground"));
      expect(siteColor(mode, "--tone-accent"), mode).not.toBe(siteColor(mode, "--brand"));
    }
  });

  it("should start a theme's accent tone from its own accent when that accent is not the site's ink", () => {
    for (const id of ["ocean", "forest", "editorial", "ink"]) {
      const preset = builtInPresets().get(id);
      if (!preset) throw new Error(`${id} preset missing`);
      for (const mode of ["light", "dark"] as const) {
        expect(toneTokens(mode, preset.theme[mode])["--tone-accent"], `${id} ${mode}`).toBe(normalizeColor(preset.theme[mode].accent));
      }
    }
  });

  it("should read at 4.5:1 in globals.css as text and as a badge on the site's page, card, muted fill, and every hue fill, in both modes", () => {
    // The site paints its own hand-set hue fills, not derived ones, so the rule is checked here against the values a reader sees.
    for (const mode of ["light", "dark"] as const) {
      const surfaces = [...site[mode].keys()].filter((name) => /^--block-[a-z]+-bg$/.test(name));
      expect(surfaces).toHaveLength(9);
      for (const tone of ["info", "success", "warning", "danger", "accent"]) {
        const text = parseColor(siteColor(mode, `--tone-${tone}`) ?? "");
        if (!text) throw new Error(`${mode} has no --tone-${tone}`);
        for (const surfaceName of ["--background", "--card", "--muted", ...surfaces]) {
          const surface = parseColor(siteColor(mode, surfaceName) ?? "");
          if (!surface) throw new Error(`${mode} has no ${surfaceName}`);
          expect(contrastRatio(text, surface), `${mode} ${tone} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(text, paintOver(text, toneTintMax, surface)), `${mode} ${tone} badge on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("should read at 4.5:1 on every preset's surfaces and on the tone's own tint over each, in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        for (const tone of ["info", "success", "warning", "danger", "accent"]) {
          const text = parseColor(tokens[`--tone-${tone}`] ?? "");
          if (!text) throw new Error(`${id} ${mode} has no --tone-${tone}`);
          for (const surfaceName of ["--card", "--background", "--secondary", "--muted", "--accent"]) {
            const surface = parseColor(tokens[surfaceName] ?? "");
            if (!surface) throw new Error(`${id} ${mode} has no ${surfaceName}`);
            expect(contrastRatio(text, surface), `${id} ${mode} ${tone} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(text, paintOver(text, toneTintMax, surface)), `${id} ${mode} ${tone} on its tint over ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
});

describe("chart colors", () => {
  const series = Array.from({ length: 8 }, (_, index) => `--series-${String(index + 1)}`);
  const quiet = ["--background", "--card", "--secondary", "--muted", "--accent"];
  const hueFills = (names: Iterable<string>) => [...names].filter((name) => /^--block-[a-z]+-bg$/.test(name));

  it("should show at 3:1 in globals.css on the site's page, card, quiet surfaces, and every hue fill, in both modes", () => {
    // The site paints its own hand-set hue fills, so its chart colors are checked against the values a reader sees.
    for (const mode of ["light", "dark"] as const) {
      const surfaces = [...quiet, ...hueFills(site[mode].keys())];
      expect(surfaces).toHaveLength(14);
      for (const name of series) {
        const mark = parseColor(siteColor(mode, name) ?? "");
        if (!mark) throw new Error(`${mode} has no ${name}`);
        for (const surfaceName of surfaces) {
          const surface = parseColor(siteColor(mode, surfaceName) ?? "");
          if (!surface) throw new Error(`${mode} has no ${surfaceName}`);
          expect(contrastRatio(mark, surface), `${mode} ${name} on ${surfaceName}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("should reproduce the site chart colors in globals.css when deriving them from the Default preset", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const [name, value] of Object.entries(seriesTokens(mode, siteDefaultColors(mode)))) {
        expect(normalizeColor(value), `${mode} ${name}`).toBe(siteColor(mode, name));
      }
    }
  });

  it("should show at 3:1 on every preset's page, card, quiet surfaces, and every hue fill, in both modes", () => {
    for (const [id, preset] of builtInPresets()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = paletteTokens(mode, preset.theme[mode]);
        const surfaces = [...quiet, ...hueFills(Object.keys(tokens))];
        expect(surfaces, `${id} ${mode}`).toHaveLength(14);
        for (const name of series) {
          const mark = parseColor(tokens[name] ?? "");
          if (!mark) throw new Error(`${id} ${mode} has no ${name}`);
          for (const surfaceName of surfaces) {
            const surface = parseColor(tokens[surfaceName] ?? "");
            if (!surface) throw new Error(`${id} ${mode} has no ${surfaceName}`);
            expect(contrastRatio(mark, surface), `${id} ${mode} ${name} on ${surfaceName}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it("should use a chart color exactly as written when it already shows on every surface", () => {
    const colors = siteDefaultColors("light");
    expect(seriesTokens("light", colors)["--series-1"]).toBe(colors.chart[0]);
  });

  it("should keep the hue and chroma and move only the lightness when a chart color is too faint", () => {
    const colors = { ...siteDefaultColors("light"), chart: ["oklch(0.9 0.12 95)", "oklch(0.5 0.1 250)", "oklch(0.5 0.1 150)", "oklch(0.5 0.1 30)", "oklch(0.5 0.1 300)", "oklch(0.5 0.1 200)"] };
    const held = parseColor(seriesTokens("light", colors)["--series-1"] ?? "");
    expect(held?.c).toBeCloseTo(0.12, 3);
    expect(held?.h).toBeCloseTo(95, 1);
    expect(held?.l).toBeLessThan(0.9);
    expect(held && contrastRatio(held, parseColor(colors.card) ?? held)).toBeGreaterThanOrEqual(3);
  });
});

describe("derived tokens", () => {
  it("should only set tokens that globals.css defines when a palette is mapped", () => {
    const preset = builtInPresets().get("classic");
    if (!preset) throw new Error("classic preset missing");
    for (const name of Object.keys(paletteTokens("light", preset.theme.light))) {
      expect(site.light.has(name) || name === "--card-edge", name).toBe(true);
    }
  });
});
