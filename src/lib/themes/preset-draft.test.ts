import { describe, expect, it } from "vitest";

import { contrastSuggestions } from "./artifact-theme";
import { applyContrastChanges, chartFromText, chartToText, draftFromJson, draftFromTheme, draftJson, issuesByPath } from "./preset-draft";
import { presetTheme } from "./resolve";
import { parseTheme, parseThemeForPreview } from "./schema";

function ocean() {
  const theme = presetTheme("ocean");
  if (!theme) throw new Error("ocean preset missing");
  return theme;
}

describe("preset drafts", () => {
  it("should round-trip a theme through the raw JSON tab when nothing changes", () => {
    const draft = draftFromTheme(ocean());
    const parsed = draftFromJson(draftJson(draft), draft);
    expect(parsed).toEqual({ ok: true, draft });
    expect(parseTheme(draft).ok).toBe(true);
  });

  it("should keep the form's values for keys the JSON leaves out", () => {
    const draft = draftFromTheme(ocean());
    const parsed = draftFromJson('{"version":1,"radius":"xl","fonts":{"body":"inter"}}', draft);
    expect(parsed.ok && parsed.draft.radius).toBe("xl");
    expect(parsed.ok && parsed.draft.fonts).toEqual({ ...draft.fonts, body: "inter" });
    expect(parsed.ok && parsed.draft.light).toEqual(draft.light);
  });

  it("should refuse broken JSON, a non-object, and unknown keys with a plain message", () => {
    const draft = draftFromTheme(ocean());
    expect(draftFromJson("{", draft)).toMatchObject({ ok: false });
    expect(draftFromJson("[1]", draft)).toMatchObject({ ok: false });
    expect(draftFromJson('{"css":"body{}"}', draft)).toMatchObject({ ok: false, message: expect.stringContaining('Unknown key "css"') as string });
  });

  it("should group issues by field, with chart items under the chart", () => {
    const grouped = issuesByPath([
      { path: "light.chart.3", message: "bad" },
      { path: "light.chart", message: "count" },
      { path: "dark.foreground", message: "low" },
    ]);
    expect(grouped.get("light.chart")).toEqual(["bad", "count"]);
    expect(grouped.get("dark.foreground")).toEqual(["low"]);
  });

  it("should make the theme pass contrast when the suggestions are applied", () => {
    const draft = draftFromTheme({ ...ocean(), light: { ...ocean().light, mutedForeground: "#dddddd" } });
    expect(parseTheme(draft).ok).toBe(false);
    const fixed = applyContrastChanges(draft, contrastSuggestions(draft));
    expect(parseTheme(fixed).ok).toBe(true);
    expect(fixed.dark).toEqual(draft.dark);
  });

  it("should still draw a preview when only contrast fails, and none while a color does not parse", () => {
    const faint = draftFromTheme({ ...ocean(), light: { ...ocean().light, mutedForeground: "#dddddd" } });
    expect(parseThemeForPreview(faint)).not.toBeNull();
    expect(parseThemeForPreview({ ...faint, light: { ...faint.light, card: "url(x)" } })).toBeNull();
  });

  it("should read chart colors one per line and drop blank lines", () => {
    expect(chartFromText(" #111111 \n\n#222222\n")).toEqual(["#111111", "#222222"]);
    expect(chartToText(["a", "b"])).toBe("a\nb");
  });
});
