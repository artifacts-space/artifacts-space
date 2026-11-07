import { describe, expect, it } from "vitest";

import { parseArtifactThemeInput, pickerValue, sameArtifactTheme, themeLabel, themePresetSummaries } from "./artifact-theme";
import { presetTheme } from "./resolve";
import type { Theme } from "./schema";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`${id} preset missing`);
  return theme;
}

function message(input: unknown): string {
  const result = parseArtifactThemeInput(input);
  if (result.ok) throw new Error("expected a refusal");
  return result.message;
}

describe("parseArtifactThemeInput", () => {
  it("should accept a built-in preset id when one is named", () => {
    expect(parseArtifactThemeInput("editorial")).toEqual({ ok: true, theme: "editorial" });
    expect(parseArtifactThemeInput(" paper ")).toEqual({ ok: true, theme: "paper" });
  });

  it.each([null, undefined, ""])("should mean no theme when the input is %j", (input) => {
    expect(parseArtifactThemeInput(input)).toEqual({ ok: true, theme: null });
  });

  it("should refuse an unknown preset and list the real ones when the id is wrong", () => {
    const text = message("neon");
    expect(text).toContain('"neon" is not a theme preset');
    expect(text).toContain("paper");
    expect(text).toContain("themes_list");
  });

  it("should refuse values that are neither a string nor an object", () => {
    expect(message(42)).toContain("preset id");
    expect(message(["paper"])).toContain("preset id");
  });

  it("should normalise theme JSON when it validates", () => {
    const result = parseArtifactThemeInput({ version: 1, light: { ...preset("ocean").light, accent: "#1d4ed8" }, dark: preset("ocean").dark });
    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.theme !== "object" || result.theme === null) return;
    expect(result.theme.light.accent).toMatch(/^oklch\(/);
    expect(result.theme.fonts).toEqual({ body: "geist-sans", heading: "geist-sans", mono: "geist-mono" });
  });

  it("should name the pair, the ratio, and a passing color when contrast fails", () => {
    const ocean = preset("ocean");
    const text = message({ version: 1, light: ocean.light, dark: { ...ocean.dark, mutedForeground: "oklch(0.42 0.02 240)" } });
    expect(text).toContain("dark.mutedForeground on dark.card");
    expect(text).toContain("(WCAG AA)");
    expect(text).toMatch(/set dark\.mutedForeground to oklch\(/);
    expect(text).toContain("/docs/themes#contrast");
  });

  it("should give every problem with its path and no autofix when the theme is malformed", () => {
    const text = message({ version: 1, light: { ...preset("ocean").light, foreground: "url(x)" }, dark: preset("ocean").dark, extra: true });
    expect(text).toContain("light.foreground:");
    expect(text).not.toContain("autofix");
  });

  it("should refuse theme JSON that is far too long before parsing it", () => {
    expect(message({ version: 1, notes: "x".repeat(9_000) })).toContain("too long");
  });
});

describe("sameArtifactTheme", () => {
  it("should treat null and undefined as the same empty theme", () => {
    expect(sameArtifactTheme(null, undefined)).toBe(true);
    expect(sameArtifactTheme(null, "default")).toBe(false);
  });
});

describe("theme labels", () => {
  it("should name presets, custom JSON, and no theme for people", () => {
    expect(themeLabel("paper")).toBe("Paper");
    expect(themeLabel(preset("paper"))).toBe("Custom");
    expect(themeLabel(null)).toBe("Default");
    expect(pickerValue(null)).toBe("default");
    expect(pickerValue(preset("ink"))).toBe("custom");
    expect(pickerValue("ink")).toBe("ink");
  });
});

describe("themePresetSummaries", () => {
  it("should list every preset with its font names when agents ask", () => {
    const summaries = themePresetSummaries();
    expect(summaries.map((item) => item.id)).toContain("default");
    expect(summaries.find((item) => item.id === "classic")?.fonts).toEqual({
      body: { id: "roboto", family: "Roboto" },
      heading: { id: "roboto", family: "Roboto" },
      mono: { id: "jetbrains-mono", family: "JetBrains Mono" },
    });
  });
});
