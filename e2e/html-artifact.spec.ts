import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * An HTML artifact: a full web page that runs, scripts and all, in a
 * sandboxed frame on its own page host. The editor fixture
 * (/dev/editor?kind=html, no database) holds a page whose script counts
 * clicks. The sandbox itself is tested in e2e/page-frame.spec.ts.
 */

const frameSelector = "iframe[data-slot=page-frame]";
const source = (page: Page) => page.getByRole("textbox", { name: "Artifact source" });

async function openPage(page: Page, query = "") {
  await page.goto(`/dev/editor?kind=html${query}`);
  await expect(page.getByRole("banner").getByRole("button", { name: "More actions" })).toBeEnabled();
}

async function runningPage(page: Page) {
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  return page.frameLocator(frameSelector);
}

test("should show the page running, with its script, in a frame on another origin", async ({ page, baseURL }) => {
  await openPage(page);
  const shown = await runningPage(page);
  await expect(shown.getByRole("heading", { name: "Counter" })).toBeVisible();
  await shown.getByRole("button", { name: "Add one" }).click();
  await shown.getByRole("button", { name: "Add one" }).click();
  await expect(shown.locator("#count")).toHaveText("2");
  const src = await page.locator(frameSelector).getAttribute("src");
  expect(new URL(src ?? "").origin).not.toBe(new URL(baseURL ?? "").origin);
  await expect(page.locator(frameSelector)).toHaveAttribute("title", "Long html fixture");
});

test("should give the page the whole width of the window, and most of its height", async ({ page, isMobile }) => {
  await openPage(page);
  await runningPage(page);
  const box = await page.locator("[data-slot=page-frame-box]").boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("the page frame is not on the page");
  expect(box.width).toBeGreaterThan(viewport.width * (isMobile ? 0.85 : 0.9));
  expect(box.height).toBeGreaterThanOrEqual(384);
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.8 + 1);
  await expectNoAxeViolations(page.locator("[data-slot=page-frame-box]"));
});

test("should put the page over the whole window with Full screen, keep what the reader did in it, and come back", async ({ page }) => {
  await openPage(page);
  const shown = await runningPage(page);
  await shown.getByRole("button", { name: "Add one" }).click();
  await expect(shown.locator("#count")).toHaveText("1");
  const box = page.locator("[data-slot=html-page]");
  // The /app pane's body contains its layout (a size container), which holds a fixed box inside it. The fixture
  // has no such ancestor, so the test gives the box one: full screen must cover the window all the same.
  await box.evaluate((element) => { if (element.parentElement) element.parentElement.style.contain = "layout"; });
  const inPage = await box.boundingBox();

  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  const viewport = page.viewportSize();
  expect(await box.boundingBox()).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
  // Nothing of the site is drawn over it: each corner belongs to the box.
  const corners = await box.evaluate((element) => {
    const { innerWidth: width, innerHeight: height } = window;
    return [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]].map(([x, y]) => element.contains(document.elementFromPoint(x ?? 0, y ?? 0)));
  });
  expect(corners).toEqual([true, true, true, true]);
  // The site's bar stays, with the artifact's title, and the page is the same page: its count is kept.
  const bar = page.locator("[data-slot=html-page-bar]");
  await expect(bar).toContainText("Long html fixture");
  await expect(page.frameLocator(frameSelector).locator("#count")).toHaveText("1");
  await page.frameLocator(frameSelector).getByRole("button", { name: "Add one" }).click();
  await expect(page.getByRole("dialog", { name: "Long html fixture, full screen" })).toBeVisible();
  await expectNoAxeViolations(box);

  await bar.getByRole("button", { name: "Exit full screen" }).click();
  expect(await box.boundingBox()).toEqual(inPage);
  await expect(page.frameLocator(frameSelector).locator("#count")).toHaveText("2");
  await expect(page.getByRole("button", { name: "Full screen", exact: true })).toBeFocused();
});

test("should leave full screen with Escape, and keep the focus in the page's box while it covers the window", async ({ page }) => {
  await openPage(page);
  await runningPage(page);
  const button = page.getByRole("button", { name: "Full screen", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  const exit = page.getByRole("button", { name: "Exit full screen" });
  await expect(exit).toBeFocused();
  // Everything else is covered, so focus that leaves the box comes back to the bar.
  await page.evaluate(() => { document.querySelector<HTMLElement>("a[href], button:not([data-slot=html-page] button)")?.focus(); });
  await expect(exit).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=html-page]")).not.toHaveAttribute("data-full-screen", "");
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("should show the HTML with Edit source, and the changed page with Hide source", async ({ page }) => {
  await openPage(page);
  await runningPage(page);
  await page.getByRole("button", { name: "Edit source" }).click();
  await expect(source(page)).toHaveValue(/^<!doctype html>/);
  await expect(page.locator(frameSelector)).toHaveCount(0);

  const html = await source(page).inputValue();
  await source(page).fill(html.replace("<h1>Counter</h1>", "<h1>Tally</h1>"));
  await page.getByRole("button", { name: "Hide source" }).click();
  const shown = await runningPage(page);
  await expect(shown.getByRole("heading", { name: "Tally" })).toBeVisible();
  // The new version is a fresh page: its script runs again, from zero.
  await shown.getByRole("button", { name: "Add one" }).click();
  await expect(shown.locator("#count")).toHaveText("1");
});

test("should say how a page starts when the source stops being one", async ({ page }) => {
  await openPage(page);
  await page.getByRole("button", { name: "Edit source" }).click();
  await source(page).fill("<h1>Only a heading</h1>");
  await expect(page.getByRole("status").filter({ hasText: "must start with <!doctype html>" })).toBeVisible();
});

test("should show the source with a note where no page host is set up", async ({ page }) => {
  await openPage(page, "&pagehost=none");
  await expect(page.getByRole("note").filter({ hasText: "This page cannot run here, so its source is shown." })).toBeVisible();
  await expect(page.locator(frameSelector)).toHaveCount(0);
  await expect(page.locator("[data-artifact-kind=html]")).toContainText("<!doctype html>");
  // The script is text here: it never runs on the site's origin.
  await expect(page.locator("[data-artifact-kind=html]")).toContainText("clicks += 1;");
});
