import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { switchOffHover, switchOnHover } from "@/lib/themes/derive";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Every `--name: N%` declaration in globals.css, as fractions. */
function tints(name: string): number[] {
  return [...css.matchAll(new RegExp(`^\\s*${name}:\\s*([\\d.]+)%;`, "gm"))].map((match) => Number(match[1]) / 100);
}

describe("the Switch hover tints", () => {
  it("should match the tints the theme derivation checks when either side changes", () => {
    // Exactly one declaration each: a per-mode override would need a matching change in derive.ts.
    expect(tints("--switch-on-hover-tint")).toEqual([switchOnHover]);
    expect(tints("--switch-off-hover-tint")).toEqual([switchOffHover]);
  });
});
