import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * The spreadsheet grid: a sheet at the viewer's size limit keeps only the
 * cells in view in the page while it scrolls both ways, and on an
 * artifact page the sheet spans the window, fills it down to the bottom,
 * and only the grid scrolls sideways.
 */

const largeSheet = (page: Page) => page.locator('[data-specimen="csv · Sheet at the size limit"]').getByRole("grid", { name: "CSV table" });

const cellCount = (grid: Locator) => grid.locator("[role=gridcell]").count();

async function scrollGrid(grid: Locator, to: { top?: number; left?: number }) {
  await grid.evaluate((element, position) => { element.scrollTo(position); }, to);
}

async function pageScrollsSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("should keep only the cells in view in the page when a sheet at the size limit scrolls", async ({ page }) => {
  await page.goto("/dev/components#formats");
  const grid = largeSheet(page);
  await grid.scrollIntoViewIfNeeded();
  await expect(grid).toHaveAttribute("aria-rowcount", "1001");
  await expect(grid).toHaveAttribute("aria-colcount", "51");
  await expect(grid.getByRole("gridcell", { name: "r1c1", exact: true })).toBeVisible();
  // 50,000 cells in the file; a few hundred at most in the page.
  expect(await cellCount(grid)).toBeLessThan(800);

  await scrollGrid(grid, { top: 16_000 });
  await expect(grid.getByRole("gridcell", { name: "r501c1", exact: true })).toBeAttached();
  await expect(grid.getByRole("gridcell", { name: "r2c1", exact: true })).toHaveCount(0);
  expect(await cellCount(grid)).toBeLessThan(800);

  await scrollGrid(grid, { left: 100_000 });
  await expect(grid.getByRole("gridcell", { name: /^r\d+c50$/ }).first()).toBeAttached();
  // Column 1 holds the active cell, so it stays; its neighbour scrolled out of the page.
  await expect(grid.getByRole("gridcell", { name: /^r\d+c2$/ })).toHaveCount(0);
  expect(await cellCount(grid)).toBeLessThan(800);

  // The header row and row numbers stay frozen in place.
  await expect(grid.getByRole("columnheader", { name: "col_50" })).toBeInViewport();
  await expect(grid.getByRole("rowheader", { name: "501", exact: true })).toBeInViewport();
});

test("should label every rendered cell with its place in the whole sheet when the grid is virtualized", async ({ page }) => {
  await page.goto("/dev/components#formats");
  const grid = largeSheet(page);
  await scrollGrid(grid, { top: 32 * 300, left: 2000 });
  const row = grid.locator('[role=row][aria-rowindex="302"]');
  await expect(row).toBeAttached();
  const cell = row.getByRole("gridcell").last();
  const index = Number(await cell.getAttribute("aria-colindex"));
  expect(index).toBeGreaterThan(2);
  await expect(cell).toHaveText(`r301c${String(index - 1)}`);
});

test("should span the window and fill it to the bottom when a CSV opens on its page", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid).toBeVisible();
  const measure = () => grid.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: window.innerWidth - box.right, bottom: window.innerHeight - box.bottom, width: box.width, window: window.innerWidth };
  });
  // It ends just above the bottom of the window, once the heading above it has settled.
  await expect.poll(async () => (await measure()).bottom).toBeLessThanOrEqual(40);
  const sizes = await measure();
  // Full width: only the page's side padding is left, never the 960px column.
  expect(sizes.left).toBeLessThanOrEqual(64);
  expect(sizes.right).toBeLessThanOrEqual(64);
  expect(sizes.width).toBeGreaterThan(sizes.window - 130);
  expect(sizes.bottom).toBeGreaterThanOrEqual(0);
  // The grid has no card around it.
  expect(await grid.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
});

test("should scroll only the grid sideways and keep the page header in view when the sheet scrolls", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid).toBeVisible();
  await scrollGrid(grid, { top: 5000, left: 3000 });
  await expect.poll(() => grid.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await pageScrollsSideways(page)).toBeLessThanOrEqual(0);
  await grid.scrollIntoViewIfNeeded();
  await expect(page.getByRole("banner")).toBeInViewport();
});

test("should keep the active cell in view when the keyboard moves it past the edge of the grid", async ({ page }) => {
  await page.goto("/dev/components#formats");
  const grid = largeSheet(page);
  await grid.focus();
  await page.keyboard.press("Control+End");
  await expect(grid.getByRole("gridcell", { name: "r1000c50", exact: true })).toBeInViewport();
  await expect(grid).toHaveAttribute("aria-activedescendant", /-999-49$/);
  await page.keyboard.press("Control+Home");
  await expect(grid.getByRole("columnheader", { name: "col_01" })).toBeInViewport();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  const active = await grid.getAttribute("aria-activedescendant");
  const row = Number(/-(\d+)-0$/.exec(active ?? "")?.[1]);
  // A page is a screenful of rows, not a fixed ten.
  expect(row).toBeGreaterThan(4);
  await expect(page.locator(`[id="${active ?? ""}"]`)).toBeInViewport();
});
