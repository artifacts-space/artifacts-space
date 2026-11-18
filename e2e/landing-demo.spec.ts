import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * The landing page's hero demo shows an agent saving a web page (kind
 * `html`), and the page's copy leaves out the earlier formats (`ui` and
 * `canvas`), which are kept for old artifacts and not offered for new work.
 * The demo is checked in its finished state (reduced motion keeps it
 * there): every part of the web page it draws sits whole inside its window,
 * and the window inside the browser, at phone, tablet, and desktop widths.
 */

const themes = ["light", "dark"] as const;

test.use({ reducedMotion: "reduce" });

async function openLanding(page: Page, theme: (typeof themes)[number] = "light") {
  await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);
  await page.goto("/?home");
  await expect(page.getByRole("heading", { level: 1, name: "The collaboration space for humans and agents." })).toBeVisible();
}

test("should show the agent saving a web page and name no earlier format when the hero demo is drawn", async ({ page }) => {
  await openLanding(page);
  const demo = page.locator("#demo .demo-desk");

  await expect(demo.locator(".demo-call").first(), "the terminal's first call saves a web page").toContainText('kind: "html"');
  await expect(demo.locator(".demo-call").first()).toContainText('content: "<!doctype html>');
  await expect(demo.getByText("html", { exact: true }).filter({ visible: true }), "the artifact's format chip").toHaveCount(1);
  await expect(demo.locator(".text-kind-html").filter({ visible: true }).first(), "the web page icon in its own color").toBeVisible();

  const words = (await demo.textContent()) ?? "";
  expect(words).not.toMatch(/\bui\b/);
  expect(words).not.toMatch(/\bcanvas\b/i);
  await expect(demo.locator(".text-kind-ui, .text-kind-canvas")).toHaveCount(0);
  await expect(page.locator("#demo figcaption")).toContainText("web page");

  // The page is plain markup now: no interface renderer (the `ui` container) is drawn anywhere on the landing page.
  const interfaces = await page.evaluate(() => [...document.querySelectorAll("*")].filter((node) => getComputedStyle(node).containerName === "ui").length);
  expect(interfaces, "interfaces drawn on the landing page").toBe(0);
});

test("should list the current formats and leave out interfaces and canvases when the pricing section is read", async ({ page }) => {
  await openLanding(page);
  const pricing = page.getByRole("region", { name: "Pricing" });
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.getByText("Save Markdown docs, web pages, code, plain text, JSON, CSV tables, SVG images, and diagrams. Add files to any of them.")).toBeVisible();
  const words = (await pricing.textContent()) ?? "";
  expect(words).not.toMatch(/interfaces?|canvas(es)?/i);
  expect(words).not.toMatch(/all \d+ formats/i);
});

interface Box { name: string; top: number; bottom: number; left: number; right: number }

/** The browser's stage, the web page's window, and each visible part of the page, in window coordinates. */
async function demoBoxes(page: Page): Promise<{ stage: Box; window: Box; parts: Box[]; overflow: number }> {
  return page.evaluate(() => {
    const box = (element: Element, name: string) => {
      const rect = element.getBoundingClientRect();
      return { name, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    const stage = document.querySelector(".demo-app__stage");
    const pageWindow = document.querySelector("[data-demo-window]");
    if (!stage || !pageWindow) throw new Error("the demo is missing its stage or its page window");
    const parts = [...pageWindow.querySelectorAll("[data-demo-card]")]
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden")
      .map((element) => box(element, element.getAttribute("data-demo-card") ?? "part"));
    return { stage: box(stage, "stage"), window: box(pageWindow, "page window"), parts, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

const inside = (inner: Box, outer: Box) =>
  inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5 && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;

const overlaps = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

const widths = { phone: [360, 390], desktop: [640, 768, 1024, 1280, 1440] } as const;

for (const project of ["phone", "desktop"] as const) {
  for (const width of widths[project]) {
    test(`should end the demo's web page on whole parts inside its window when the window is ${String(width)}px wide`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== project, `${project} widths only`);
      await page.setViewportSize({ width, height: project === "phone" ? 844 : 900 });
      await openLanding(page);
      await page.locator("#demo").scrollIntoViewIfNeeded();
      const { stage, window: pageWindow, parts, overflow } = await demoBoxes(page);

      expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
      expect(inside(pageWindow, stage), `the page window sits inside the browser: ${JSON.stringify({ pageWindow, stage })}`).toBe(true);
      expect(parts.map((part) => part.name), "the page always shows its headline, numbers, and chart").toEqual(expect.arrayContaining(["header", "stats", "chart"]));
      for (const part of parts) expect(inside(part, pageWindow), `${part.name} sits whole inside the page window`).toBe(true);
      for (const [index, part] of parts.entries()) {
        for (const other of parts.slice(index + 1)) expect(overlaps(part, other), `${part.name} and ${other.name} do not overlap`).toBe(false);
      }
    });
  }
}

for (const theme of themes) {
  test(`should pass axe, contrast included, on the landing page when the site theme is ${theme}`, async ({ page }) => {
    await openLanding(page, theme);
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*(^|\s)dark(\s|$))/);
    await page.evaluate(() => document.fonts.ready);
    await expectNoAxeViolations(page);
  });
}
