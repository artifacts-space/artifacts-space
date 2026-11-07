import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "./resolve";
import type { Theme } from "./schema";
import { themeBackdropStyle, themeFontAssets, themeScopeProps } from "./style";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`${id} preset missing`);
  return theme;
}

/** Only custom properties with canonical values, never anything that could close a declaration. */
const safeValue = /^(oklch\([0-9. /]+\)|light-dark\(oklch\([0-9. /]+\), oklch\([0-9. /]+\)\)|[0-9.]+rem|"[A-Za-z0-9 ]+"(, "[A-Za-z0-9 ]+ Fallback")?, [a-zA-Z, -]+|var\(--font-geist-(sans|mono)\), [a-zA-Z, -]+)$/;

describe("themeScopeProps", () => {
  it("should emit no style and no fonts when the theme is the site default", () => {
    const props = themeScopeProps(siteDefaultTheme());
    expect(props).toEqual({ style: {}, modeClass: null, colored: false, stylesheets: [], preloads: [] });
  });

  it("should pin the mode class and keep the site colors when Default is locked to dark", () => {
    const props = themeScopeProps({ ...siteDefaultTheme(), mode: "dark" });
    expect(props.modeClass).toBe("dark");
    expect(props.style).toEqual({});
  });

  it("should carry both modes in light-dark() values when the theme follows the reader", () => {
    const props = themeScopeProps(preset("ocean"));
    expect(props.modeClass).toBeNull();
    expect(props.style["--background"]).toBe(`light-dark(${preset("ocean").light.background}, ${preset("ocean").dark.background})`);
    expect(props.style["--series-1"]).toMatch(/^light-dark\(/);
    expect(props.style["--radius"]).toBe("0.5rem");
  });

  it("should emit plain values of the locked mode when the theme locks one", () => {
    const theme: Theme = { ...preset("ocean"), mode: "light" };
    const props = themeScopeProps(theme);
    expect(props.modeClass).toBe("light");
    expect(props.style["--background"]).toBe(theme.light.background);
  });

  it("should let the preview force a mode when an override is given", () => {
    const props = themeScopeProps(preset("ocean"), "dark");
    expect(props.modeClass).toBe("dark");
    expect(props.style["--card"]).toBe(preset("ocean").dark.card);
  });

  it("should emit only safe custom properties when mapping any preset", () => {
    for (const id of ["paper", "graphite", "ink", "ocean", "forest", "editorial", "classic"]) {
      for (const [name, value] of Object.entries(themeScopeProps(preset(id)).style)) {
        expect(name, id).toMatch(/^--[a-z0-9-]+$/);
        expect(value, `${id} ${name}`).toMatch(safeValue);
      }
    }
  });

  it("should set font stacks for non-Geist slots only when a theme picks other faces", () => {
    const style = themeScopeProps(preset("editorial")).style;
    expect(style["--theme-font-body"]).toBe('"Source Serif 4", "Source Serif 4 Fallback", ui-serif, Georgia, serif');
    expect(style["--theme-font-heading"]).toMatch(/^"Instrument Serif"/);
    expect(style["--theme-font-mono"]).toBeUndefined();
  });
});

describe("themeFontAssets", () => {
  it("should load nothing when the theme uses Geist only", () => {
    expect(themeFontAssets(siteDefaultTheme())).toEqual({ stylesheets: [], preloads: [] });
  });

  it("should load each used face once and preload only text faces when slots repeat a face", () => {
    expect(themeFontAssets(preset("classic"))).toEqual({
      stylesheets: ["/fonts/v1/roboto/font.css", "/fonts/v1/jetbrains-mono/font.css"],
      preloads: ["/fonts/v1/roboto/roboto-normal-100-900.woff2"],
    });
  });
});

describe("themeBackdropStyle", () => {
  it("should leave the backdrop alone when the theme is the site default", () => {
    expect(themeBackdropStyle(siteDefaultTheme())).toEqual({});
  });

  it("should set only the backdrop variable when a theme has its own background", () => {
    const style = themeBackdropStyle(preset("paper"));
    expect(Object.keys(style)).toEqual(["--theme-backdrop"]);
    expect(style["--theme-backdrop"]).toMatch(/^light-dark\(oklch/);
  });
});
