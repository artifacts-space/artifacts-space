import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    layoutShifts: number[];
  }
}

/** Records every layout shift, including ones right after input, so typing is measured too. */
async function recordLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    window.layoutShifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.layoutShifts.push((entry as PerformanceEntry & { value: number }).value);
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Page height numbers: how far the document runs past the footer, and where the editor sits. */
function layout(page: Page) {
  return page.evaluate(() => {
    const footer = document.querySelector("footer");
    const bar = document.querySelector("[data-slot=editor-bar]");
    const footerBottom = footer ? footer.getBoundingClientRect().bottom + window.scrollY : 0;
    const chrome = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--artifact-chrome-height")) || 0;
    return {
      excess: document.documentElement.scrollHeight - Math.max(footerBottom, window.innerHeight),
      chrome,
      barTop: bar ? bar.getBoundingClientRect().top : null,
      barBottom: bar ? bar.getBoundingClientRect().bottom : null,
      innerHeight: window.innerHeight,
    };
  });
}

/** Opens the fixture page. Editors get the artifact unlocked in place: no Edit button, no Save button. */
async function openFixture(page: Page, kind: string) {
  await page.goto(`/dev/editor?kind=${kind}`);
  await expect(page.locator("[data-slot=editor-bar]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Editor mode" })).toHaveCount(0);
}

/** Opens View source from the bar's More menu. */
async function viewSource(page: Page) {
  await page.locator("[data-slot=editor-bar]").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = page.getByRole("textbox", { name: "Artifact source" });
  await expect(source).toBeVisible();
  return source;
}

const saveStatus = (page: Page) => page.locator("[data-slot=editor-bar]").getByRole("status");

test("should show a long ui artifact as itself, with its source one menu away and no empty page below the footer", async ({ page }) => {
  await recordLayoutShifts(page);
  await openFixture(page, "ui");
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  // Charts and screen-reader text in a long interface are positioned elements; none may reach past the footer.
  expect((await layout(page)).excess, "empty space below the footer").toBeLessThanOrEqual(1);

  const source = await viewSource(page);
  const opened = await layout(page);
  expect(opened.excess, "empty space below the footer with the source open").toBeLessThanOrEqual(1);
  expect((await source.boundingBox())?.y ?? Infinity, "the source starts on screen").toBeLessThan(opened.innerHeight);

  // Breaking the spec holds the autosave and says why; fixing it again lets it go. The layout never moves.
  await source.click({ position: { x: 40, y: 20 } });
  await page.keyboard.press("Control+Home");
  await page.evaluate(() => { window.layoutShifts = []; });
  await page.keyboard.type("oops ", { delay: 40 });
  await expect(saveStatus(page)).toContainText("Not saved yet");
  for (let index = 0; index < 5; index++) await page.keyboard.press("Backspace");
  await expect(saveStatus(page)).not.toContainText("Not saved");
  await expect(page.getByText("Valid Interface.")).toBeVisible();
  const shift = await page.evaluate(() => window.layoutShifts.reduce((sum, value) => sum + value, 0));
  expect(shift, "layout shift while typing").toBeLessThan(0.1);
  expect((await layout(page)).excess).toBeLessThanOrEqual(1);
});

test("should edit a long Markdown artifact in place and save it on its own", async ({ page }) => {
  await openFixture(page, "markdown");
  const content = page.getByRole("textbox", { name: "Artifact content" });
  await expect(content).toBeVisible();
  await expect(page.getByRole("button", { name: "Markdown" }), "the source lives behind View source").toHaveCount(0);
  expect((await layout(page)).excess).toBeLessThanOrEqual(1);

  await page.getByRole("textbox", { name: "Title" }).fill("Renamed fixture");
  await expect(saveStatus(page)).toHaveText("Saved");
  await content.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed in place.");
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(content).toContainText("Typed in place.");
});
