import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { switchOffHover, switchOnHover } from "@/lib/themes/derive";

const source = readFileSync(join(process.cwd(), "src/components/ui/switch.tsx"), "utf8");

/** The percentage in the hover color-mix class that tints `track` toward `toward`. */
function hoverPercents(track: "switch-on" | "switch-off", toward: "foreground" | "background"): number[] {
  const pattern = new RegExp(`hover:not-data-disabled:bg-\\[color-mix\\(in_oklch,var\\(--${track}\\),var\\(--${toward}\\)_(\\d+)%\\)\\]`, "g");
  return [...source.matchAll(pattern)].map((match) => Number(match[1]) / 100);
}

describe("the Switch hover tints", () => {
  it("should match the tints the theme derivation checks when either side changes", () => {
    expect(hoverPercents("switch-on", "foreground")).toEqual([switchOnHover]);
    expect(hoverPercents("switch-on", "background")).toEqual([switchOnHover]);
    expect(hoverPercents("switch-off", "foreground")).toEqual([switchOffHover]);
  });
});
