import { describe, expect, it } from "vitest";

import { presetTheme } from "./resolve";
import { emptyThemeContext, resolveArtifactTheme, type ArtifactThemeContext } from "./team-preset-rules";
import { markdownThemeLabel, storedThemeForReader, themeIdForReader } from "./theme-privacy";

/*
 * Team preset names and ids stay with the team: readers outside it (signed
 * out, or signed in but not a member) see "Custom", never the name, the
 * id's slug, or "team default". Built-in names are the site's.
 */

const secretRef = "team:acme-q3-launch-x7k2p9";
const secretName = "Acme Q3 launch";

function context(teamDefault: string | null): ArtifactThemeContext {
  const theme = presetTheme("ocean");
  if (!theme) throw new Error("The ocean preset is missing.");
  return { teamDefault, presets: new Map([[secretRef, { ref: secretRef, teamId: "acme", name: secretName, theme }]]) };
}

describe("markdownThemeLabel", () => {
  it("should name the team preset and mark the team default when the reader is in the team", () => {
    expect(markdownThemeLabel(resolveArtifactTheme(null, context(secretRef)), true)).toBe(`${secretName} (team default)`);
    expect(markdownThemeLabel(resolveArtifactTheme(secretRef, context(null)), true)).toBe(secretName);
  });

  it("should say Custom and never name the preset or the team default when the reader is outside the team", () => {
    for (const resolved of [resolveArtifactTheme(null, context(secretRef)), resolveArtifactTheme(secretRef, context(null))]) {
      const label = markdownThemeLabel(resolved, false);
      expect(label).toBe("Custom");
      expect(label).not.toContain(secretName);
      expect(label).not.toContain("team default");
    }
  });

  it("should keep built-in names for outsiders, without saying it is the team default", () => {
    expect(markdownThemeLabel(resolveArtifactTheme(null, context("paper")), false)).toBe("Paper");
    expect(markdownThemeLabel(resolveArtifactTheme("paper", context(null)), false)).toBe("Paper");
  });

  it("should have no line for the site default whoever reads it", () => {
    expect(markdownThemeLabel(resolveArtifactTheme(null, emptyThemeContext), false)).toBeNull();
    expect(markdownThemeLabel(resolveArtifactTheme(null, emptyThemeContext), true)).toBeNull();
  });
});

describe("themeIdForReader", () => {
  it("should hide a team preset id from outsiders and show it to the team", () => {
    expect(themeIdForReader(secretRef, false)).toBe("custom");
    expect(themeIdForReader(secretRef, true)).toBe(secretRef);
  });

  it("should show built-in ids to everyone and call theme JSON custom", () => {
    expect(themeIdForReader("paper", false)).toBe("paper");
    expect(themeIdForReader(null, true)).toBe("custom");
  });
});

describe("storedThemeForReader", () => {
  it("should replace a team preset id with custom only when the reader is outside the team", () => {
    expect(storedThemeForReader(secretRef, false)).toBe("custom");
    expect(storedThemeForReader(secretRef, true)).toBe(secretRef);
    expect(storedThemeForReader("paper", false)).toBe("paper");
    expect(storedThemeForReader(null, false)).toBeNull();
  });
});
