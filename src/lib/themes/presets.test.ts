import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastIssues } from "./contrast";
import { paletteTokens, syntaxTokens } from "./derive";
import { contrastRatio, normalizeColor, parseColor } from "./color";
import { themePresets } from "./presets";
import { builtInPresets } from "./resolve";
import { parseTheme } from "./schema";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--name: value` declarations of the first block whose selector starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const entries = [...body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()] as const);
  return new Map(entries);
}

const site = { light: block(":root,\n.light,"), dark: block(".dark,\n:root:not(.dark)") };

function siteColor(mode: "light" | "dark", name: string): string | null {
  const value = site[mode].get(name);
  return value ? normalizeColor(value) : null;
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
    expect(preset.theme.fonts).toEqual({ body: "geist-sans", heading: "geist-sans", mono: "geist-mono" });
    expect(preset.theme.radius).toBe("md");
    expect(site.light.get("--radius")).toBe("0.375rem");
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
