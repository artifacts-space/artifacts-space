import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";

import { ArtifactPageTheme } from "./artifact-page-theme";

function preset(id: string): Theme {
  const theme = presetTheme(id);
  if (!theme) throw new Error(`no preset ${id}`);
  return theme;
}

function render(theme: Theme | null) {
  return renderToStaticMarkup(<ArtifactPageTheme theme={theme}><footer>Footer</footer></ArtifactPageTheme>);
}

describe("ArtifactPageTheme", () => {
  it("should set no colors and pin no mode when the artifact has no theme", () => {
    for (const theme of [null, siteDefaultTheme()]) {
      const html = render(theme);
      expect(html).not.toContain("style=");
      expect(html).toMatch(/^<div class="bg-background text-foreground">/);
    }
  });

  it("should carry the theme's colors but not its fonts when the artifact has a theme", () => {
    const html = render(preset("editorial"));
    expect(html).toContain("--background:light-dark(");
    expect(html).toContain("--mention:");
    expect(html).not.toContain("--theme-font");
    expect(html).toContain("<footer>Footer</footer>");
  });

  it("should pin the mode when the theme locks one", () => {
    const html = render({ ...preset("ocean"), mode: "dark" });
    expect(html).toMatch(/class="[^"]*\bdark\b/);
    expect(html).not.toContain("light-dark(");
  });
});
