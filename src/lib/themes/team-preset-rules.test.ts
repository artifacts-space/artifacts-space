import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "./resolve";
import type { Theme } from "./schema";
import {
  allowedPresetTeamIds,
  canManageTeamThemes,
  duplicatePresetName,
  emptyThemeContext,
  hasRoomForPreset,
  isTeamPresetRef,
  markdownThemeLabel,
  newPresetSlug,
  parseTeamDefaultInput,
  parseTeamPresetInput,
  presetDeleteMessage,
  resolveArtifactTheme,
  slugifyPresetName,
  teamPresetSlug,
  themeTeamId,
  usableTeamPresets,
  type ArtifactThemeContext,
} from "./team-preset-rules";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`${id} preset missing`);
  return theme;
}

const brandRef = "team:brand-abc234";
const otherRef = "team:other-xyz789";
const stored = [
  { slug: "brand-abc234", teamId: "team-a", name: "Brand", theme: preset("ocean") },
  { slug: "other-xyz789", teamId: "team-b", name: "Other", theme: preset("forest") },
];

function contextFor(allowedTeam: string, teamDefault: string | null): ArtifactThemeContext {
  return { teamDefault, presets: usableTeamPresets(stored, new Set([allowedTeam])) };
}

describe("team preset ids", () => {
  it("should recognise a team preset id when it has the team: prefix and a slug", () => {
    expect(isTeamPresetRef("team:brand-abc234")).toBe(true);
    expect(teamPresetSlug("team:brand-abc234")).toBe("brand-abc234");
  });

  it("should refuse a team preset id when the slug is empty, has odd characters, or is too long", () => {
    expect(isTeamPresetRef("team:")).toBe(false);
    expect(isTeamPresetRef("team:Brand!")).toBe(false);
    expect(isTeamPresetRef(`team:${"a".repeat(57)}`)).toBe(false);
    expect(isTeamPresetRef("ocean")).toBe(false);
    expect(teamPresetSlug("ocean")).toBeNull();
  });

  it("should make a readable slug with a random suffix when a preset is created", () => {
    expect(slugifyPresetName("Acme Brand Ünïcode!")).toBe("acme-brand-unicode");
    expect(slugifyPresetName("✨")).toBe("preset");
    const slug = newPresetSlug("Acme Brand", () => 0);
    expect(slug).toBe("acme-brand-aaaaaa");
    expect(isTeamPresetRef(`team:${newPresetSlug("x".repeat(80))}`)).toBe(true);
  });
});

describe("which team's themes an artifact uses", () => {
  it("should use the shared team when the artifact is shared through it", () => {
    expect(themeTeamId({ visibility: "team", teamId: "team-a" }, false)).toBe("team-a");
    expect(themeTeamId({ visibility: "public", teamId: "team-a" }, false)).toBe("team-a");
  });

  it("should use no team when the artifact is private or in a personal team", () => {
    expect(themeTeamId({ visibility: "private", teamId: "team-a" }, false)).toBeNull();
    expect(themeTeamId({ visibility: "link", teamId: "personal-1" }, true)).toBeNull();
    expect(themeTeamId({ visibility: "team", teamId: "gone" }, null)).toBeNull();
  });

  it("should allow only the theme team's presets when there is one, else the author's teams", () => {
    expect([...allowedPresetTeamIds("team-a", ["team-a", "team-b"])]).toEqual(["team-a"]);
    expect([...allowedPresetTeamIds(null, ["team-a", "team-b"])]).toEqual(["team-a", "team-b"]);
  });
});

describe("resolveArtifactTheme", () => {
  it("should resolve in order: the artifact's theme, then the team default, then the site default", () => {
    const context = contextFor("team-a", "paper");
    expect(resolveArtifactTheme("forest", context)).toMatchObject({ presetId: "forest", source: "artifact", name: "Forest" });
    expect(resolveArtifactTheme(null, context)).toMatchObject({ presetId: "paper", source: "team", name: "Paper" });
    expect(resolveArtifactTheme(null, emptyThemeContext)).toEqual({ presetId: "default", source: "site", name: "Default", theme: siteDefaultTheme() });
  });

  it("should render a team preset live when the artifact names one of its team's presets", () => {
    const resolved = resolveArtifactTheme(brandRef, contextFor("team-a", null));
    expect(resolved).toMatchObject({ presetId: brandRef, source: "artifact", name: "Brand" });
    expect(resolved.theme).toEqual(preset("ocean"));
  });

  it("should use a team preset as the team default when the team picked one", () => {
    expect(resolveArtifactTheme(null, contextFor("team-a", brandRef))).toMatchObject({ presetId: brandRef, source: "team", name: "Brand" });
  });

  it("should fall back to the team default when the artifact names another team's preset", () => {
    expect(resolveArtifactTheme(otherRef, contextFor("team-a", "paper"))).toMatchObject({ presetId: "paper", source: "team" });
    expect(resolveArtifactTheme(otherRef, contextFor("team-a", null))).toMatchObject({ source: "site" });
  });

  it("should fall back cleanly when the preset was deleted, including when it was the team default", () => {
    const deleted: ArtifactThemeContext = { teamDefault: brandRef, presets: new Map() };
    expect(resolveArtifactTheme(brandRef, deleted)).toMatchObject({ presetId: "default", source: "site" });
    expect(resolveArtifactTheme(brandRef, { teamDefault: "graphite", presets: new Map() })).toMatchObject({ presetId: "graphite", source: "team" });
  });

  it("should skip a stored team preset when its theme no longer validates", () => {
    const broken = [{ slug: "brand-abc234", teamId: "team-a", name: "Brand", theme: { version: 1 } }];
    expect(usableTeamPresets(broken, new Set(["team-a"])).size).toBe(0);
  });

  it("should label the Markdown theme line with the team default marked and no line for the site default", () => {
    const context = contextFor("team-a", brandRef);
    expect(markdownThemeLabel(resolveArtifactTheme(null, context))).toBe("Brand (team default)");
    expect(markdownThemeLabel(resolveArtifactTheme("paper", context))).toBe("Paper");
    expect(markdownThemeLabel(resolveArtifactTheme(null, emptyThemeContext))).toBeNull();
  });
});

describe("who manages team themes", () => {
  it("should allow owners and admins of a shared team", () => {
    expect(canManageTeamThemes({ role: "owner", personal: false })).toBe(true);
    expect(canManageTeamThemes({ role: "admin", personal: false })).toBe(true);
  });

  it("should refuse plain members and personal teams", () => {
    expect(canManageTeamThemes({ role: "member", personal: false })).toBe(false);
    expect(canManageTeamThemes({ role: "owner", personal: true })).toBe(false);
  });

  it("should stop adding presets at the runaway cap", () => {
    expect(hasRoomForPreset(49)).toBe(true);
    expect(hasRoomForPreset(50)).toBe(false);
  });
});

describe("parseTeamPresetInput", () => {
  it("should accept a named preset and normalise its theme when it validates", () => {
    const result = parseTeamPresetInput({ name: "  Brand ", theme: { version: 1, light: preset("ocean").light, dark: preset("ocean").dark } });
    expect(result.ok && result.value.name).toBe("Brand");
    expect(result.ok && result.value.theme.light.background).toBe(preset("ocean").light.background);
  });

  it("should refuse low contrast with each failing path instead of adjusting it", () => {
    const theme = { ...preset("ocean"), light: { ...preset("ocean").light, mutedForeground: "#dddddd" } };
    const result = parseTeamPresetInput({ name: "Faint", theme });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain("light.mutedForeground");
  });

  it("should refuse a missing name and oversized theme JSON", () => {
    expect(parseTeamPresetInput({ name: " ", theme: preset("ocean") })).toMatchObject({ ok: false, message: "Give the preset a name." });
    expect(parseTeamPresetInput({ name: "Big", theme: { padding: "x".repeat(9000) } })).toMatchObject({ ok: false });
  });

  it("should keep a duplicate's name within the limit", () => {
    expect(duplicatePresetName("Brand")).toBe("Brand copy");
    expect(duplicatePresetName("x".repeat(60))).toHaveLength(60);
  });
});

describe("parseTeamDefaultInput", () => {
  const teamRefs = new Set([brandRef]);

  it("should accept the site default, a built-in, or one of the team's presets", () => {
    expect(parseTeamDefaultInput(null, teamRefs)).toEqual({ ok: true, value: null });
    expect(parseTeamDefaultInput("", teamRefs)).toEqual({ ok: true, value: null });
    expect(parseTeamDefaultInput("paper", teamRefs)).toEqual({ ok: true, value: "paper" });
    expect(parseTeamDefaultInput(brandRef, teamRefs)).toEqual({ ok: true, value: brandRef });
  });

  it("should refuse another team's preset or an unknown id as the team default", () => {
    expect(parseTeamDefaultInput(otherRef, teamRefs).ok).toBe(false);
    expect(parseTeamDefaultInput("neon", teamRefs).ok).toBe(false);
    expect(parseTeamDefaultInput({ version: 1 }, teamRefs).ok).toBe(false);
  });
});

describe("presetDeleteMessage", () => {
  it("should say how many artifacts use the preset and that they fall back", () => {
    expect(presetDeleteMessage({ artifacts: 3, isDefault: false })).toBe("Used by 3 artifacts. They go back to the team default, then the site default.");
    expect(presetDeleteMessage({ artifacts: 1, isDefault: true })).toContain("Used by 1 artifact. They go back");
    expect(presetDeleteMessage({ artifacts: 0, isDefault: true })).toBe("Used by 0 artifacts. It is the team default, so the team goes back to the site default.");
  });
});
