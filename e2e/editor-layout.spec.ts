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

/** Opens Edit and returns where the Edit button was and where the page was scrolled before the click. */
async function openEditor(page: Page, kind: string) {
  await page.goto(`/dev/editor?kind=${kind}`);
  const edit = page.getByRole("button", { name: "Edit" });
  await expect(edit).toBeVisible();
  const before = await edit.evaluate((button) => ({ top: button.getBoundingClientRect().top, scrollY: window.scrollY }));
  await edit.click();
  await expect(page.getByRole("form", { name: /^Edit / })).toBeVisible();
  return before;
}

/** The editor opens where the Edit button was: the page does not scroll and the bar sits below the pinned header. */
async function expectOpenedInPlace(page: Page, before: { top: number; scrollY: number }) {
  const opened = await layout(page);
  expect(await page.evaluate(() => window.scrollY), "the page keeps its scroll position").toBe(before.scrollY);
  expect(Math.abs((opened.barTop ?? -1) - before.top), "the editor bar takes the Edit button's place").toBeLessThanOrEqual(2);
  expect(opened.barTop ?? -1, "the editor bar is below the pinned header").toBeGreaterThanOrEqual(opened.chrome - 1);
  return opened;
}

/** The title sits under the editor bar, and the source starts on screen at the full width of the editor. */
async function expectSourceInView(page: Page, opened: { barBottom: number | null; innerHeight: number }) {
  const title = await page.getByRole("textbox", { name: "Title" }).boundingBox();
  const source = await page.getByRole("textbox", { name: "Artifact content" }).boundingBox();
  const form = await page.getByRole("form", { name: /^Edit / }).boundingBox();
  expect(title?.y ?? -1).toBeGreaterThanOrEqual(opened.barBottom ?? Infinity);
  expect(source?.y ?? Infinity).toBeLessThan(opened.innerHeight);
  expect(source?.width ?? 0, "the source uses the full content width").toBeGreaterThan((form?.width ?? Infinity) - 4);
}

const modeTabs = (page: Page) => page.getByRole("tablist", { name: "Editor mode" });

test("should open a long ui artifact in place, as in the workspace editor, with no empty page below the footer", async ({ page }) => {
  await recordLayoutShifts(page);
  const before = await openEditor(page, "ui");
  const source = page.getByRole("textbox", { name: "Artifact content" });
  await expect(source).toBeVisible();

  // The page does not move, and the document ends at the footer.
  const opened = await expectOpenedInPlace(page, before);
  expect(opened.excess, "empty space below the footer").toBeLessThanOrEqual(1);

  // The title and the first lines of the source are in view, in one full-width pane.
  await expectSourceInView(page, opened);
  await expect(page.getByRole("region", { name: "Preview" })).toHaveCount(0);

  // Edit and Preview tabs, as in the workspace editor. It opens on Edit.
  const tabs = modeTabs(page);
  await expect(tabs.getByRole("tab", { name: /edit/i })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: /preview/i }).click();
  await expect(source).toHaveCount(0);
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  // Charts and screen-reader text in a long preview are positioned elements; none may reach past the footer.
  expect((await layout(page)).excess, "empty space below the footer with the preview open").toBeLessThanOrEqual(1);
  await tabs.getByRole("tab", { name: /edit/i }).click();
  await expect(source).toBeVisible();

  // Typing, breaking the JSON, and fixing it again never moves the layout.
  await source.click({ position: { x: 40, y: 20 } });
  await page.keyboard.press("Control+Home");
  await page.evaluate(() => { window.layoutShifts = []; });
  await page.keyboard.type("oops ", { delay: 40 });
  const status = page.getByRole("form", { name: /^Edit / }).getByRole("status");
  await expect(status).not.toContainText("ready to save");
  for (let index = 0; index < 5; index++) await page.keyboard.press("Backspace");
  await expect(status).toHaveText("Valid Interface. It is ready to save.");
  const shift = await page.evaluate(() => window.layoutShifts.reduce((sum, value) => sum + value, 0));
  expect(shift, "layout shift while typing").toBeLessThan(0.1);
  expect((await layout(page)).excess).toBeLessThanOrEqual(1);
});

test("should open a long Markdown artifact in the rich editor where the reader was", async ({ page }) => {
  const before = await openEditor(page, "markdown");
  await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Markdown" })).toBeVisible();
  await expect(modeTabs(page)).toHaveCount(0);
  const opened = await expectOpenedInPlace(page, before);
  expect(opened.excess).toBeLessThanOrEqual(1);
});
