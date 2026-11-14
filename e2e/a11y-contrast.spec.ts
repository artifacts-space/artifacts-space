import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Color contrast across whole pages, in light and in dark: every text color
 * on every surface it sits on reads at WCAG AA. The gallery holds each
 * interface block in each tone (badges, callouts, board labels, calendar
 * events), the MCP reference holds the write badges, the "required" labels
 * and code comments, a component page holds a live example, and the landing
 * page holds the actor colors. The status tones and syntax colors are set to
 * pass by rule (toneTokens and syntaxTokens in src/lib/themes/derive.ts); a
 * failure here means a new color or a new surface under one.
 */

const pages = [
  { path: "/dev/components", name: "the component gallery" },
  { path: "/docs/mcp", name: "the MCP reference" },
  { path: "/docs/json-render/components/board", name: "a component page" },
  { path: "/?home", name: "the landing page" },
] as const;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const { path, name } of pages) {
      test(`should pass color contrast on ${name} when the site is ${scheme}`, async ({ page, isMobile }) => {
        // Colors do not change with the viewport, and the gallery is slow to scan: once, on the desktop.
        test.skip(isMobile, "the same colors as the desktop run");
        // The script runs in every frame; a sandboxed one (a data: URL in the gallery) has no storage and needs no theme.
        await page.addInitScript((value) => {
          try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
        }, scheme);
        await page.goto(path);
        await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*(^|\s)dark(\s|$))/);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        // Fonts and lazy pieces settle before colors are read.
        await page.waitForLoadState("networkidle");
        await expectNoAxeViolations(page, { only: ["color-contrast"] });
      });
    }
  });
}
