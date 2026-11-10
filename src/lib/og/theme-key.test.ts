import { describe, expect, it } from "vitest";

import { presetTheme } from "@/lib/themes/resolve";

import { ogImageSegment, ogThemeKey, parseOgImageSegment } from "./theme-key";

function preset(id: string) {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`No preset ${id}`);
  return theme;
}

const versionId = "11111111-1111-4111-8111-111111111111";

describe("ogThemeKey", () => {
  it("should give the same short URL-safe key for the same theme, whatever its key order", () => {
    const theme = preset("paper");
    const reordered = { dark: theme.dark, light: theme.light, fonts: theme.fonts, radius: theme.radius, mode: theme.mode, version: theme.version };
    expect(ogThemeKey(theme)).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(ogThemeKey(reordered)).toBe(ogThemeKey(theme));
  });

  it("should change the key when any color, font, or radius changes", () => {
    const theme = preset("paper");
    const keys = new Set([
      ogThemeKey(theme),
      ogThemeKey({ ...theme, radius: "xl" }),
      ogThemeKey({ ...theme, fonts: { ...theme.fonts, body: "inter" } }),
      ogThemeKey({ ...theme, dark: { ...theme.dark, accent: "oklch(0.7 0.1 40)" } }),
      ogThemeKey(preset("ocean")),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe("image path segments", () => {
  it("should change the key with a variant, and keep the theme's own key without one", () => {
    const theme = preset("default");
    expect(ogThemeKey(theme, null)).toBe(ogThemeKey(theme));
    expect(ogThemeKey(theme, "csv-off")).not.toBe(ogThemeKey(theme));
    expect(ogThemeKey(theme, "csv-off")).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });

  it("should read back the version and key it wrote", () => {
    const key = ogThemeKey(preset("paper"));
    expect(parseOgImageSegment(ogImageSegment(versionId, key))).toEqual({ versionId, themeKey: key });
  });

  it("should read an old link without a key, or with a malformed one, as no key", () => {
    expect(parseOgImageSegment(versionId)).toEqual({ versionId, themeKey: null });
    expect(parseOgImageSegment(`${versionId}.not a key`)).toEqual({ versionId, themeKey: null });
  });
});
