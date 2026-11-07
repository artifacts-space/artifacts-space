import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";

import { ogCardPalette, siteCardPalette } from "./card-palette";

describe("ogCardPalette", () => {
  it("should keep the site card when there is no theme or it is the default", () => {
    expect(ogCardPalette(null)).toEqual(siteCardPalette);
    expect(ogCardPalette(siteDefaultTheme())).toEqual(siteCardPalette);
  });

  it("should use the theme's light palette as hex when the artifact has a theme", () => {
    const ink = presetTheme("ink");
    if (!ink) throw new Error("ink preset missing");
    const palette = ogCardPalette(ink);
    for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette).not.toEqual(siteCardPalette);
  });
});
