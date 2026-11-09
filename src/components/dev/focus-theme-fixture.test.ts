import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "@/lib/themes/color";
import { contrastIssues } from "@/lib/themes/contrast";
import { paletteTokens } from "@/lib/themes/derive";
import { presetTheme } from "@/lib/themes/resolve";

import { focusTheme } from "./focus-theme-fixture";

describe("the gallery's focus theme fixture", () => {
  it("should pass validation and contrast when parsed", () => {
    expect(contrastIssues(focusTheme())).toEqual([]);
  });

  it("should put the site's light ring under 3:1 on its card when compared, so the specimen needs the derived ring", () => {
    // The site's light ring, as the Default preset derives it (derive.test.ts pins that to globals.css).
    const site = presetTheme("default");
    if (!site) throw new Error("default preset missing");
    const ring = parseColor(paletteTokens("light", site.light)["--ring"] ?? "");
    const card = parseColor(focusTheme().light.card);
    if (!ring || !card) throw new Error("unreadable colors");
    expect(contrastRatio(ring, card)).toBeLessThan(3);
  });
});
