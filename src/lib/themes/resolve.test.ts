import { describe, expect, it } from "vitest";

import { parseArtifactThemeInput } from "./artifact-theme";
import { presetTheme, resolveTheme, siteDefaultTheme } from "./resolve";
import type { Theme } from "./schema";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`${id} preset missing`);
  return theme;
}

describe("resolveTheme", () => {
  it("should use the artifact's preset when it names a known one", () => {
    expect(resolveTheme("paper", "ocean")).toEqual({ presetId: "paper", source: "artifact", theme: preset("paper") });
  });

  it("should fall back to the team default when the artifact has no theme", () => {
    expect(resolveTheme(null, "ocean")).toMatchObject({ presetId: "ocean", source: "team" });
  });

  it("should fall back to the site default when neither is set", () => {
    expect(resolveTheme(undefined, undefined)).toEqual({ presetId: "default", source: "site", theme: siteDefaultTheme() });
  });

  it("should accept custom JSON when the artifact's theme validates", () => {
    const custom = { ...preset("forest"), radius: "xl" };
    const resolved = resolveTheme(custom, "ocean");
    expect(resolved).toMatchObject({ presetId: null, source: "artifact" });
    expect(resolved.theme.radius).toBe("xl");
  });

  it("should skip a theme that does not validate when resolving", () => {
    const bad = { ...preset("forest"), light: { ...preset("forest").light, foreground: "url(x)" } };
    expect(resolveTheme(bad, "ocean").source).toBe("team");
    expect(resolveTheme("no-such-preset", null).source).toBe("site");
  });

  it("should render a stored artifact theme when there is no team default yet", () => {
    const stored = parseArtifactThemeInput({ version: 1, light: preset("ocean").light, dark: preset("ocean").dark });
    if (!stored.ok || stored.theme === null) throw new Error("ocean JSON should validate");
    expect(resolveTheme(stored.theme, null)).toMatchObject({ presetId: null, source: "artifact", theme: { light: preset("ocean").light } });
    expect(resolveTheme("graphite", null)).toMatchObject({ presetId: "graphite", source: "artifact" });
    expect(resolveTheme(null, null)).toMatchObject({ presetId: "default", source: "site" });
  });

  it("should find extra presets by id when the caller passes team presets", () => {
    const team = new Map([["team-brand", preset("ink")]]);
    expect(resolveTheme("team-brand", null, team)).toMatchObject({ presetId: "team-brand", source: "artifact", theme: preset("ink") });
  });
});
