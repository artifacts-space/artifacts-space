import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor, type Oklch } from "@/lib/themes/color";

import { blockHues } from "./block-color-rules";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--name: value` declarations of the first block whose selector starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
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
  it.each(Object.keys(modes) as (keyof typeof modes)[])("should keep every %s text hue readable (AA) on the page, a card, and its own background", (mode) => {
    for (const hue of blockHues) {
      const text = token(mode, `--block-${hue}`);
      for (const surface of [token(mode, "--background"), token(mode, "--card"), token(mode, `--block-${hue}-bg`)]) {
        expect(contrastRatio(text, surface), `${mode} ${hue}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(Object.keys(modes) as (keyof typeof modes)[])("should keep body text readable (AA) on every %s background hue", (mode) => {
    const ink = token(mode, "--foreground");
    for (const hue of blockHues) expect(contrastRatio(ink, token(mode, `--block-${hue}-bg`)), `${mode} ${hue}`).toBeGreaterThanOrEqual(4.5);
  });
});
