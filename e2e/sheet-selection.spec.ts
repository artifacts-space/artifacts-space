import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * Selecting in the spreadsheet grid, keyboard first: arrows, Tab, Enter,
 * Home, End, Page keys, and Cmd or Ctrl+arrow move the selection; Shift
 * extends it; copy gives the block as TSV; editors paste TSV or CSV and
 * edit through the formula bar, which readers can only read.
 */

const viewerGrid = (page: Page) => page.locator('[data-specimen="csv · Sheet at the size limit"]').getByRole("grid", { name: "CSV table" });
const formula = (scope: Page | Locator) => scope.getByRole("textbox", { name: "Cell value" });
const activeText = (grid: Locator) => grid.evaluate((element) => document.getElementById(element.getAttribute("aria-activedescendant") ?? "")?.textContent ?? null);

/** Records what the next copy puts on the clipboard, read inside the copy event so no clipboard permission is needed. */
async function captureCopy(page: Page) {
  await page.evaluate(() => {
    const store = window as unknown as { copied?: string };
    document.addEventListener("copy", (event) => { store.copied = event.clipboardData?.getData("text/plain") ?? ""; });
  });
  return () => page.evaluate(() => (window as unknown as { copied?: string }).copied ?? null);
}

/** Pastes text into the focused grid as a clipboard paste would. */
async function paste(grid: Locator, text: string) {
  await grid.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

async function openViewer(page: Page) {
  await page.goto("/dev/components#formats");
  const grid = viewerGrid(page);
  await grid.scrollIntoViewIfNeeded();
  await expect(grid.getByRole("gridcell", { name: "r1c1", exact: true })).toBeVisible();
  await grid.focus();
  return grid;
}

test("should move the selection with the keyboard like a spreadsheet when a reader uses the sheet", async ({ page }) => {
  const grid = await openViewer(page);
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => activeText(grid)).toBe("r1c1");
  await page.keyboard.press("Enter");
  await expect.poll(() => activeText(grid)).toBe("r2c1");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Tab");
  await expect.poll(() => activeText(grid)).toBe("r1c2");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("End");
  await expect.poll(() => activeText(grid)).toBe("r1c50");
  await page.keyboard.press("Home");
  await page.keyboard.press("ControlOrMeta+ArrowDown");
  await expect.poll(() => activeText(grid)).toBe("r1000c1");
  await page.keyboard.press("ControlOrMeta+ArrowRight");
  await expect.poll(() => activeText(grid)).toBe("r1000c50");
  await expect(grid.getByRole("gridcell", { name: "r1000c50", exact: true })).toBeInViewport();
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect.poll(() => activeText(grid)).toBe("col_50");
  await page.keyboard.press("PageDown");
  const paged = await activeText(grid);
  expect(Number(/^r(\d+)c50$/.exec(paged ?? "")?.[1])).toBeGreaterThan(3);
});

test("should copy the selected block as TSV when a reader selects with Shift and copies", async ({ page }) => {
  const grid = await openViewer(page);
  const copied = await captureCopy(page);
  await grid.getByRole("gridcell", { name: "r1c1", exact: true }).click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(grid.locator("[role=gridcell][aria-selected=true]")).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(copied).toBe("r1c1\tr1c2\nr2c1\tr2c2");

  // Shift+click extends from the same anchor; the header row comes along when it is in the block.
  await page.keyboard.press("Control+Home");
  await grid.getByRole("gridcell", { name: "r2c2", exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(copied).toBe("col_01\tcol_02\nr1c1\tr1c2\nr2c1\tr2c2");
});

test("should show the selected cell's whole value read-only in the formula bar for a reader", async ({ page }) => {
  const grid = await openViewer(page);
  await grid.getByRole("gridcell", { name: "r3c4", exact: true }).click();
  const bar = formula(page.locator('[data-specimen="csv · Sheet at the size limit"]'));
  await expect(bar).toHaveValue("r3c4");
  await expect(bar).toHaveAttribute("readonly", "");
  await expect(page.locator('[data-specimen="csv · Sheet at the size limit"] [data-formula-bar]')).toContainText("col_04 · 3");
  await bar.focus();
  await page.keyboard.press("Enter");
  await expect(grid, "Enter in the read-only bar goes back to the grid").toBeFocused();
});

test.describe("an editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/editor?kind=sheet");
    await expect(page.getByRole("grid", { name: "CSV grid editor" }).getByRole("gridcell", { name: "r1c1", exact: true })).toBeVisible();
  });

  const grid = (page: Page) => page.getByRole("grid", { name: "CSV grid editor" });

  test("should paste a TSV block from the selected cell and keep it selected", async ({ page }) => {
    await grid(page).getByRole("gridcell", { name: "r2c2", exact: true }).click();
    await paste(grid(page), "a\tb\nc\td\n");
    await expect(grid(page).getByRole("gridcell", { name: "a", exact: true })).toHaveAttribute("aria-colindex", "3");
    await expect(grid(page).getByRole("gridcell", { name: "d", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Pasted 2 rows × 2 columns.")).toBeVisible();
  });

  test("should paste CSV text as a block and fill a selection with a single value", async ({ page }) => {
    await grid(page).getByRole("gridcell", { name: "r1c1", exact: true }).click();
    await paste(grid(page), 'x,"y, z"\n1,2\n');
    await expect(grid(page).getByRole("gridcell", { name: "y, z", exact: true })).toBeVisible();
    await grid(page).getByRole("gridcell", { name: "r5c1", exact: true }).click();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowRight");
    await paste(grid(page), "same");
    await expect(grid(page).getByRole("gridcell", { name: "same", exact: true })).toHaveCount(4);
  });

  test("should edit the selected cell from the formula bar and return to the grid", async ({ page }) => {
    await grid(page).getByRole("gridcell", { name: "r1c3", exact: true }).click();
    await formula(page).fill("from the bar");
    await page.keyboard.press("Enter");
    await expect(grid(page).getByRole("gridcell", { name: "from the bar", exact: true })).toBeVisible();
    await expect(grid(page)).toBeFocused();
    await formula(page).fill("thrown away");
    await page.keyboard.press("Escape");
    await expect(formula(page)).toHaveValue("from the bar");
  });

  test("should save a value typed in the formula bar when another cell is clicked", async ({ page }) => {
    await grid(page).getByRole("gridcell", { name: "r1c3", exact: true }).click();
    await formula(page).fill("kept on click");
    await grid(page).getByRole("gridcell", { name: "r4c4", exact: true }).click();
    await expect(grid(page).getByRole("gridcell", { name: "kept on click", exact: true })).toHaveAttribute("aria-colindex", "4");
    await expect(formula(page)).toHaveValue("r4c4");
  });

  test("should still edit a cell by typing and clear a selected block with Delete", async ({ page }) => {
    await grid(page).getByRole("gridcell", { name: "r1c1", exact: true }).click();
    await page.keyboard.type("typed");
    await page.keyboard.press("Enter");
    await expect(grid(page).getByRole("gridcell", { name: "typed", exact: true })).toBeVisible();
    await grid(page).getByRole("gridcell", { name: "r3c1", exact: true }).click();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Delete");
    await expect(grid(page).getByRole("gridcell", { name: "r3c1", exact: true })).toHaveCount(0);
    await expect(grid(page).getByRole("gridcell", { name: "r3c2", exact: true })).toHaveCount(0);
    await expect(grid(page).getByRole("gridcell", { name: "r3c3", exact: true })).toBeVisible();
  });
});

test("should leave the grid with Escape then Tab when Tab moves between cells", async ({ page }) => {
  const grid = await openViewer(page);
  await page.keyboard.press("Tab");
  await expect(grid).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(grid).not.toBeFocused();
});

test("should still leave with Escape then Tab when React replays the focus it queued while hydrating", async ({ page }) => {
  const grid = await openViewer(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  // A focus that lands before React hydrates the grid is queued and dispatched again after hydration, as a clone from nowhere that can arrive after keys pressed since.
  await grid.evaluate((element) => { element.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: null })); });
  await page.keyboard.press("Tab");
  await expect(grid).not.toBeFocused();
});

test("should select a block when a reader drags across cells with a mouse", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging to select needs a mouse; on a phone a drag scrolls");
  const grid = await openViewer(page);
  const from = await grid.getByRole("gridcell", { name: "r2c2", exact: true }).boundingBox();
  const to = await grid.getByRole("gridcell", { name: "r4c3", exact: true }).boundingBox();
  if (!from || !to) throw new Error("No cells to drag across.");
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(grid.getByRole("gridcell", { name: "r3c3", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(grid.getByRole("gridcell", { name: "r5c3", exact: true })).toHaveAttribute("aria-selected", "false");
  await expect(page.locator('[data-specimen="csv · Sheet at the size limit"] [data-formula-bar]')).toContainText("3 × 2");
});

test("should select a cell on the first click and edit it on the second when an editor clicks", async ({ page, isMobile }) => {
  test.skip(isMobile, "a mouse click; phones tap");
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  const cell = grid.getByRole("gridcell", { name: "r2c2", exact: true });
  await cell.click();
  await expect(grid).toHaveAttribute("aria-activedescendant", /-1-1$/);
  await expect(page.getByRole("textbox", { name: /row 2$/ })).toHaveCount(0);
  await cell.click();
  await expect(page.getByRole("textbox", { name: /row 2$/ })).toBeFocused();
});

test("should move left, not leave, on Shift+Tab after a click into the grid", async ({ page, isMobile }) => {
  test.skip(isMobile, "a mouse click; phones tap");
  const grid = await openViewer(page);
  await page.locator('[data-specimen="csv · Sheet at the size limit"]').getByRole("searchbox").focus();
  await grid.getByRole("gridcell", { name: "r2c3", exact: true }).click();
  await page.keyboard.press("Shift+Tab");
  await expect(grid).toBeFocused();
  expect(await activeText(grid)).toBe("r2c2");
});

test("should copy only the selected text when an editor copies inside a cell being edited", async ({ page, isMobile }) => {
  test.skip(isMobile, "a hardware keyboard copy");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await grid.getByRole("gridcell", { name: "r1c1", exact: true }).click();
  await page.keyboard.type("hello world");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("hello world");
});

test("should select a cell on tap and never scroll the page sideways on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  const grid = await openViewer(page);
  await grid.getByRole("gridcell", { name: "r2c2", exact: true }).tap();
  await expect(formula(page.locator('[data-specimen="csv · Sheet at the size limit"]'))).toHaveValue("r2c2");
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
});
