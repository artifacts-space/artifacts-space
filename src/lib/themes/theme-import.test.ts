import { describe, expect, it } from "vitest";

import { applyContrastChanges } from "./preset-draft";
import { presetTheme } from "./resolve";
import { parseTheme } from "./schema";
import { importThemeJson, THEME_IMPORT_MAX_TEXT, themeExportJson, themeFileName } from "./theme-import";

function ocean() {
  const theme = presetTheme("ocean");
  if (!theme) throw new Error("ocean preset missing");
  return theme;
}

describe("importThemeJson", () => {
  it("should load an exported theme unchanged when it round-trips", () => {
    const imported = importThemeJson(themeExportJson(ocean()));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.suggestions).toEqual([]);
    expect(imported.passes).toBe(true);
    expect(parseTheme(imported.draft)).toEqual({ ok: true, theme: ocean() });
  });

  it("should normalise hex colors to oklch when the JSON was written by hand", () => {
    const handWritten = { ...ocean(), light: { ...ocean().light, background: "#ffffff" } };
    const imported = importThemeJson(JSON.stringify(handWritten));
    expect(imported.ok && imported.draft.light.background).toMatch(/^oklch\(/);
  });

  it("should refuse text that is empty, not JSON, or not an object, with a plain message", () => {
    expect(importThemeJson("   ")).toMatchObject({ ok: false, message: expect.stringMatching(/Paste theme JSON/) as unknown });
    expect(importThemeJson("{ \"version\": 1,")).toMatchObject({ ok: false, message: expect.stringMatching(/not valid JSON/) as unknown });
    expect(importThemeJson("[1, 2]")).toMatchObject({ ok: false, message: expect.stringMatching(/is an object/) as unknown });
  });

  it("should refuse text over the size limit before parsing it", () => {
    expect(importThemeJson(`{${" ".repeat(THEME_IMPORT_MAX_TEXT)}}`)).toMatchObject({ ok: false, message: expect.stringMatching(/too long/) as unknown });
  });

  it("should refuse unknown keys, bad colors, and smuggled CSS with every problem named", () => {
    const bad = { ...ocean(), extra: true, light: { ...ocean().light, accent: "url(x)" } };
    const imported = importThemeJson(JSON.stringify(bad));
    expect(imported.ok).toBe(false);
    expect(!imported.ok && imported.message).toMatch(/cannot be used/);
    expect(!imported.ok && imported.message).toMatch(/light\.accent/);
  });

  it("should load a theme that fails only on contrast, with suggestions that make it pass", () => {
    const faint = { ...ocean(), light: { ...ocean().light, mutedForeground: "#d4d4d4" } };
    const imported = importThemeJson(JSON.stringify(faint));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.message).toMatch(/hard to read/);
    expect(imported.passes).toBe(false);
    expect(parseTheme(imported.draft).ok).toBe(false);
    expect(imported.suggestions.map((change) => change.path)).toContain("light.mutedForeground");
    expect(parseTheme(applyContrastChanges(imported.draft, imported.suggestions)).ok).toBe(true);
  });
});

describe("theme export", () => {
  it("should write pretty JSON with only theme keys when a theme is exported", () => {
    const json = themeExportJson(ocean());
    expect(Object.keys(JSON.parse(json) as object).sort()).toEqual(["dark", "fonts", "light", "mode", "radius", "version"]);
    expect(json).toContain("\n  \"version\": 1");
  });

  it("should name the download after the preset", () => {
    expect(themeFileName("Acme Brand!")).toBe("acme-brand.theme.json");
    expect(themeFileName("  ")).toBe("theme.theme.json");
  });
});
