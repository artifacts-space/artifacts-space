import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastIssues } from "./contrast";
import { mentionTokens, paletteTokens, switchTokens, syntaxTokens } from "./derive";
import { contrastRatio, mixOklch, normalizeColor, parseColor, type Oklch } from "./color";
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
 * mirror switch.tsx: on mixes 10% toward the ink in light and toward the page
 * in dark; off mixes 6% toward the ink.
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
  const onHover = mixOklch(on, mode === "light" ? ink : page, 0.1);
  const offHover = mixOklch(off, ink, 0.06);
  return [
    { name: "on track on the card", a: on, b: card },
    { name: "hovered on track on the card", a: onHover, b: card },
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
          const minimum = name.endsWith("comment") || name.endsWith("punctuation") ? 3 : 4.5;
          const color = parseColor(value);
          expect(color && contrastRatio(color, code), `${id} ${mode} ${name}`).toBeGreaterThanOrEqual(minimum);
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
        const minimum = name.endsWith("comment") || name.endsWith("punctuation") ? 3 : 4.5;
        if (color && contrastRatio(color, code) >= minimum + 0.05) expect(derived, `${mode} ${name}`).toBe(original);
        else expect(original, `${mode} ${name}`).not.toBeNull();
      }
    }
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
