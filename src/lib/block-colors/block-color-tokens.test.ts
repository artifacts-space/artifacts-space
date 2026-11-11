import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, normalizeColor, parseColor, type Oklch } from "@/lib/themes/color";

import { siteBlockColors } from "./block-color-palette";
import { blockHues } from "./block-color-rules";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--name: value` declarations of the first block whose selector list contains `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`globals.css has no block with "${selector}": the test's selector drifted`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  return new Map([...body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()] as const));
}

const modes = { light: block(":root,\n.light,"), dark: block(".dark,\n:root:not(.dark)") };

function token(mode: keyof typeof modes, name: string): Oklch {
  const color = parseColor(modes[mode].get(name) ?? "");
  if (!color) throw new Error(`No ${mode} color for ${name}`);
  return color;
}

describe("block color tokens", () => {
  it.each(Object.keys(modes) as (keyof typeof modes)[])("should match the %s palette themes start from (block-color-palette.ts)", (mode) => {
    for (const hue of blockHues) {
      expect(normalizeColor(modes[mode].get(`--block-${hue}`) ?? ""), `${mode} ${hue} text`).toBe(normalizeColor(siteBlockColors[mode][hue].text));
      expect(normalizeColor(modes[mode].get(`--block-${hue}-bg`) ?? ""), `${mode} ${hue} background`).toBe(normalizeColor(siteBlockColors[mode][hue].fill));
    }
  });

  it.each(Object.keys(modes) as (keyof typeof modes)[])("should keep every %s text hue readable (AA) on the page, a card, and every hue's background", (mode) => {
    const surfaces = [token(mode, "--background"), token(mode, "--card"), ...blockHues.map((hue) => token(mode, `--block-${hue}-bg`))];
    for (const hue of blockHues) {
      const text = token(mode, `--block-${hue}`);
      for (const [index, surface] of surfaces.entries()) expect(contrastRatio(text, surface), `${mode} ${hue} on surface ${String(index)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.keys(modes) as (keyof typeof modes)[])("should keep body text readable (AA) on every %s background hue", (mode) => {
    const ink = token(mode, "--foreground");
    for (const hue of blockHues) expect(contrastRatio(ink, token(mode, `--block-${hue}-bg`)), `${mode} ${hue}`).toBeGreaterThanOrEqual(4.5);
  });
});
