import { describe, expect, it } from "vitest";

import { parseArtifactThemeInput } from "@/lib/themes/artifact-theme";
import { themePresets } from "@/lib/themes/presets";

import { classicThemeJson, customThemeExample, lowContrastMessage, lowContrastTheme, themeMcpExamples, themesListExample } from "./theme-docs";

/** Applies "- set light.mutedForeground to oklch(…)" lines to a theme, as an agent would. */
function applySuggestions(theme: typeof lowContrastTheme, message: string) {
  const next = { ...theme, light: { ...theme.light }, dark: { ...theme.dark } };
  for (const match of message.matchAll(/- set (light|dark)\.(\w+) to (oklch\([^)]+\))/g)) {
    const [, mode, key, color] = match;
    if ((mode === "light" || mode === "dark") && key && color) Object.assign(next[mode], { [key]: color });
  }
  return next;
}

describe("theme docs examples", () => {
  it("should accept the custom theme when it is saved", () => {
    expect(parseArtifactThemeInput(customThemeExample).ok).toBe(true);
  });

  it("should accept the full-theme example when it is saved", () => {
    expect(parseArtifactThemeInput(JSON.parse(classicThemeJson)).ok).toBe(true);
  });

  it("should send valid arguments when the MCP examples are copied", () => {
    const create = JSON.parse(themeMcpExamples.createWithPreset) as { arguments: { theme: string } };
    const clear = JSON.parse(themeMcpExamples.clear) as { arguments: { theme: null } };
    expect(themePresets.some((preset) => preset.id === create.arguments.theme)).toBe(true);
    expect(parseArtifactThemeInput(clear.arguments.theme)).toEqual({ ok: true, theme: null });
  });

  it("should name the failing pairs and suggest colors when contrast fails", () => {
    const message = lowContrastMessage();
    expect(message).toContain("light.mutedForeground on light.card");
    expect(message).toContain("dark.mutedForeground on dark.card");
    expect(message).toContain("Nearest passing colors (autofix):");
  });

  it("should pass validation when the suggested colors are used as given", () => {
    const fixed = applySuggestions(lowContrastTheme, lowContrastMessage());
    expect(parseArtifactThemeInput(fixed).ok).toBe(true);
  });

  it("should show real preset ids when themes_list is abridged", () => {
    const parsed = JSON.parse(themesListExample()) as { presets: unknown[]; customFonts: Record<string, string[]> };
    expect(parsed.presets[0]).toMatchObject({ id: "default" });
    expect(parsed.customFonts.mono).toContain("jetbrains-mono");
  });
});
