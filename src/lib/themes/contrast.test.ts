import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "./color";
import { autofixContrast, contrastIssues } from "./contrast";
import { presetTheme } from "./resolve";
import type { Theme } from "./schema";

function classic(): Theme {
  const theme = presetTheme("classic");
  if (!theme) throw new Error("classic preset missing");
  return structuredClone(theme);
}

const ratio = (a: string, b: string) => contrastRatio(parseColor(a) ?? { l: 0, c: 0, h: 0, alpha: 1 }, parseColor(b) ?? { l: 1, c: 0, h: 0, alpha: 1 });

describe("contrastIssues", () => {
  it("should find nothing when the theme passes", () => {
    expect(contrastIssues(classic())).toEqual([]);
  });

  it("should flag every failing pair in the mode it fails in when text is too faint", () => {
    const theme = classic();
    theme.dark.foreground = "oklch(0.35 0 0)";
    const paths = contrastIssues(theme).map((issue) => issue.path);
    expect(paths).toEqual(["dark.foreground", "dark.foreground"]);
  });

  it("should flag the accent when a button would vanish into the card", () => {
    const theme = classic();
    theme.light.accent = "oklch(0.96 0.01 255)";
    expect(contrastIssues(theme).map((issue) => issue.path)).toContain("light.accent");
  });
});

describe("autofixContrast", () => {
  it("should return a passing theme and list each change when colors fail", () => {
    const theme = classic();
    theme.light.mutedForeground = "oklch(0.75 0.01 250)";
    theme.dark.accentForeground = "oklch(0.6 0.01 250)";
    const { theme: fixed, changes } = autofixContrast(theme);
    expect(contrastIssues(fixed)).toEqual([]);
    expect(changes.map((change) => change.path)).toEqual(["light.mutedForeground", "dark.accentForeground"]);
    expect(ratio(fixed.light.mutedForeground, fixed.light.card)).toBeGreaterThanOrEqual(4.5);
  });

  it("should change nothing when the theme already passes", () => {
    const theme = classic();
    const { theme: fixed, changes } = autofixContrast(theme);
    expect(changes).toEqual([]);
    expect(fixed).toEqual(theme);
  });

  it("should never touch surfaces when it fixes text", () => {
    const theme = classic();
    theme.light.foreground = "oklch(0.8 0 0)";
    const { theme: fixed } = autofixContrast(theme);
    expect([fixed.light.background, fixed.light.card, fixed.light.cardEdge]).toEqual([theme.light.background, theme.light.card, theme.light.cardEdge]);
  });
});
