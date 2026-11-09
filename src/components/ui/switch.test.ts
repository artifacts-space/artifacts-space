import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { switchOffHover, switchOnHover } from "@/lib/themes/derive";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The `--name: N%` declaration in globals.css, as a fraction. */
function tint(name: string): number | null {
  const match = new RegExp(`^\\s*${name}:\\s*([\\d.]+)%;`, "m").exec(css);
  return match?.[1] ? Number(match[1]) / 100 : null;
}

describe("the Switch hover tints", () => {
  it("should match the tints the theme derivation checks when either side changes", () => {
    expect(tint("--switch-on-hover-tint")).toBe(switchOnHover);
    expect(tint("--switch-off-hover-tint")).toBe(switchOffHover);
  });
});
