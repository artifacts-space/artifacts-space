import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Columns in the spreadsheet grid: drag a header's edge to resize it and
 * double-click it to fit, kept per viewer in this browser; drag a header to
 * move a column, which for a reader changes only their own view and for an
 * editor changes the file. Dragging needs a mouse, so these run on the
 * desktop; the phone check is that the handles are hidden. Every test
 * starts in a fresh browser context, so from default widths and order.
 */

const specimen = (page: Page) => page.locator('[data-specimen="csv · Sheet at the size limit"]');
const viewerGrid = (page: Page) => specimen(page).getByRole("grid", { name: "CSV table" });
const header = (grid: Locator, name: string) => grid.getByRole("columnheader", { name: new RegExp(`^${name}`) });
const width = async (element: Locator) => (await element.boundingBox())?.width ?? 0;
const headerNames = (grid: Locator) => grid.locator("[role=columnheader][data-cell]").evaluateAll((cells) => cells.slice(0, 3).map((cell) => cell.textContent.trim()));

async function dragBy(page: Page, target: Locator, dx: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Nothing to drag.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, y, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 4 });
  await page.mouse.up();
}

async function openGallerySheet(page: Page) {
  await page.goto("/dev/components#formats");
  const grid = viewerGrid(page);
  await grid.scrollIntoViewIfNeeded();
  await expect(header(grid, "col_01")).toBeVisible();
  return grid;
}

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "dragging a header or its edge needs a mouse");

  test("should resize a column when its header edge is dragged and keep the width after a reload", async ({ page }) => {
    const grid = await openGallerySheet(page);
    const column = header(grid, "col_01");
    const before = await width(column);
    await dragBy(page, grid.locator('[data-resize-handle="0"]'), 120);
    await expect.poll(() => width(column)).toBeCloseTo(before + 120, 0);
    // The cells follow the header.
    expect(await width(grid.getByRole("gridcell", { name: "r1c1", exact: true }))).toBeCloseTo(before + 120, 0);

    await page.reload();
    const again = viewerGrid(page);
    await again.scrollIntoViewIfNeeded();
    await expect.poll(() => width(header(again, "col_01"))).toBeCloseTo(before + 120, 0);
  });

  test("should fit a column to its content when its header edge is double-clicked", async ({ page }) => {
    const grid = await openGallerySheet(page);
    const column = header(grid, "col_01");
    await dragBy(page, grid.locator('[data-resize-handle="0"]'), -300);
    await expect.poll(() => width(column)).toBe(48);
    await grid.locator('[data-resize-handle="0"]').dblclick();
    await expect.poll(() => width(column)).toBeGreaterThan(90);
    const clipped = await column.locator("span.truncate").evaluate((name) => name.scrollWidth > name.clientWidth);
    expect(clipped, "the column name fits after auto-fit").toBe(false);
  });

  test("should move a column only in a reader's own view when a reader drags its header", async ({ page }) => {
    const grid = await openGallerySheet(page);
    await dragBy(page, header(grid, "col_02"), -150);
    await expect.poll(() => headerNames(grid)).toEqual(["col_02", "col_01", "col_03"]);
    await expect(grid.locator('[aria-rowindex="2"]').getByRole("gridcell").nth(0)).toHaveText("r1c2");
    await expect(specimen(page).getByText("Only you see this order.")).toBeVisible();
    // Sorting still sorts the column it shows, not the one at that place in the file.
    await expect(header(grid, "col_02")).toHaveAttribute("aria-sort", "none");

    await page.reload();
    const again = viewerGrid(page);
    await again.scrollIntoViewIfNeeded();
    await expect.poll(() => headerNames(again)).toEqual(["col_02", "col_01", "col_03"]);
    await specimen(page).getByRole("button", { name: "Reset order" }).click();
    await expect.poll(() => headerNames(again)).toEqual(["col_01", "col_02", "col_03"]);
    await expect(specimen(page).getByText("Only you see this order.")).toHaveCount(0);
  });

  test("should move a column in the file when an editor drags its header", async ({ page }) => {
    await page.goto("/dev/editor?kind=sheet");
    const grid = page.getByRole("grid", { name: "CSV grid editor" });
    await expect(header(grid, "col_01")).toBeVisible();
    await dragBy(page, header(grid, "col_01"), 150);
    await expect.poll(() => headerNames(grid)).toEqual(["col_02", "col_01", "col_03"]);
    await expect(page.getByText("Moved “col_01”. Everyone sees the new order.")).toBeVisible();
    await expect(page.getByText("Only you see this order.")).toHaveCount(0);
    // The text the editor saves has the new order.
    await page.getByRole("tab", { name: "Raw" }).click();
    await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("col_02,col_01,col_03");
  });
});

test("should move and fit a column from its menu when using only the keyboard", async ({ page }) => {
  const grid = await openGallerySheet(page);
  await grid.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Alt+ArrowDown");
  await page.getByRole("button", { name: "Move column right" }).click();
  await expect.poll(() => headerNames(grid)).toEqual(["col_02", "col_01", "col_03"]);
  await page.getByRole("button", { name: "Move column left" }).click();
  await expect.poll(() => headerNames(grid)).toEqual(["col_01", "col_02", "col_03"]);
  await expect(page.getByRole("button", { name: "Move column left" })).toBeDisabled();
  await page.getByRole("button", { name: "Fit width to content" }).click();
  await page.keyboard.press("Escape");
  await expect(grid).toBeFocused();
});

test("should hide the resize handles when the screen is touch only", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch screens only");
  const grid = await openGallerySheet(page);
  await expect(grid.locator('[data-resize-handle="0"]')).toBeHidden();
});
