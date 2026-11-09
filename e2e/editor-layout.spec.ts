import { expect, test, type Page } from "@playwright/test";

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };

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

/** Page height numbers: how far the document runs past the footer. */
function layout(page: Page) {
  return page.evaluate(() => {
    const footer = document.querySelector("footer");
    const footerBottom = footer ? footer.getBoundingClientRect().bottom + window.scrollY : 0;
    return {
      excess: document.documentElement.scrollHeight - Math.max(footerBottom, window.innerHeight),
      innerHeight: window.innerHeight,
    };
  });
}

/** The page header's "⋯", where Full width, History, and View source live. */
const moreActions = (page: Page) => page.getByRole("banner").getByRole("button", { name: "More actions" });

/** Opens the fixture page. Editors get the artifact unlocked in place: no Edit button, no Save button, no row of controls above it. */
async function openFixture(page: Page, kind: string) {
  await page.goto(`/dev/editor?kind=${kind}`);
  await expect(moreActions(page)).toBeEnabled();
  await expect(page.locator("[data-slot=editor-bar]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Editor mode" })).toHaveCount(0);
}

/** Opens View source from the header's More menu. */
async function viewSource(page: Page) {
  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = page.getByRole("textbox", { name: "Artifact source" });
  await expect(source).toBeVisible();
  return source;
}

const saveStatus = (page: Page) => page.getByRole("banner").locator("[data-slot=save-indicator]");

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
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  await content.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed in place.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  await expect(content).toContainText("Typed in place.");
});

test("should hold Full width, History, and View source in the header's More menu and keep the save status beside it", async ({ page }) => {
  await openFixture(page, "markdown");
  const header = page.getByRole("banner");
  // The right side reads: visibility, GitHub, Copy, then the editing controls.
  const order = await header.locator("[data-visibility], a[aria-label='artifacts.space on GitHub'], button:has-text('Copy'), [data-slot=save-indicator], button[aria-label='More actions']").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? (element.getAttribute("data-slot") === "save-indicator" ? "save-indicator" : element.textContent.trim())));
  expect(order).toEqual(["Private. Only you can see this.", "artifacts.space on GitHub", "Copy", "save-indicator", "More actions"]);

  // Keyboard: the menu opens from its button, moves with the arrows, and closes back onto the button.
  await moreActions(page).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Full width" })).toHaveAttribute("aria-checked", "false");
  await expect(menu.getByRole("menuitem", { name: "History" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "View source" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Try saving again" })).toHaveCount(0);
  await expect(menu.getByRole("menuitemcheckbox", { name: "Full width" }), "the first item takes focus").toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "History" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(moreActions(page)).toBeFocused();

  // The save status stays in the header while typing.
  await page.getByRole("textbox", { name: "Title" }).fill("Renamed in place");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  await expect(saveStatus(page)).toBeInViewport();
});

test("should open the History dialog from the header's More menu, with a click or the keyboard", async ({ page }) => {
  await openFixture(page, "markdown");
  const dialog = page.getByRole("dialog", { name: /^History of / });
  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "History" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Every save is kept.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await moreActions(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemcheckbox", { name: "Full width" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "History" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus"), "focus moves into the dialog").toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("should keep the header on one line with no sideways scroll when an editor's controls are in it", async ({ page }) => {
  await openFixture(page, "markdown");
  const header = page.getByRole("banner");
  const fits = await header.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const children = [...element.querySelectorAll("a, button, [data-slot=save-indicator]")].map((child) => child.getBoundingClientRect());
    return {
      overflow: element.scrollWidth - element.clientWidth,
      oneLine: children.every((box) => Math.abs(box.top + box.height / 2 - (row.top + row.height / 2)) < 2),
      inside: children.every((box) => box.left >= row.left - 0.5 && box.right <= row.right + 0.5),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(fits.overflow, "the header row does not scroll sideways").toBeLessThanOrEqual(0);
  expect(fits.oneLine, "everything sits on one line").toBe(true);
  expect(fits.inside, "nothing spills out of the row").toBe(true);
  expect(fits.pageOverflow, "the page does not scroll sideways").toBeLessThanOrEqual(0);
});
