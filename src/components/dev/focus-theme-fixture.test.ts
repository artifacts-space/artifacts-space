import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "@/lib/themes/color";
import { contrastIssues } from "@/lib/themes/contrast";

import { focusTheme } from "./focus-theme-fixture";

describe("the gallery's focus theme fixture", () => {
  it("should pass validation and contrast when parsed", () => {
    expect(contrastIssues(focusTheme())).toEqual([]);
  });

  it("should put the site's light ring under 3:1 on its card when compared, so the specimen needs the derived ring", () => {
    const ring = parseColor("oklch(0.5 0.22 262)");
    const card = parseColor(focusTheme().light.card);
    if (!ring || !card) throw new Error("unreadable colors");
    expect(contrastRatio(ring, card)).toBeLessThan(3);
  });
});
