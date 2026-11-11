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

/**
 * Scrolls the grid until `shows` is in the page. Scrolling again covers a
 * scroll made while the page was still hydrating, which a slow first load
 * on CI can undo.
 */
async function scrollGridTo(grid: Locator, to: { top?: number; left?: number }, shows: Locator) {
  await expect(async () => {
    await scrollGrid(grid, to);
    await expect(shows).toBeAttached({ timeout: 1000 });
  }).toPass();
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

  await scrollGridTo(grid, { top: 16_000 }, grid.getByRole("gridcell", { name: "r501c1", exact: true }));
  await expect(grid.getByRole("gridcell", { name: "r2c1", exact: true })).toHaveCount(0);
  expect(await cellCount(grid)).toBeLessThan(800);

  await scrollGridTo(grid, { left: 100_000 }, grid.getByRole("gridcell", { name: /^r\d+c50$/ }).first());
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
  const row = grid.locator('[role=row][aria-rowindex="302"]');
  await scrollGridTo(grid, { top: 32 * 300, left: 2000 }, row);
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
  await expect.poll(async () => { const { bottom } = await measure(); return bottom >= 0 && bottom <= 40; }).toBe(true);
  const sizes = await measure();
  // Full width: only the page's side padding is left, never the contained column.
  expect(sizes.left).toBeLessThanOrEqual(64);
  expect(sizes.right).toBeLessThanOrEqual(64);
  expect(sizes.width).toBeGreaterThan(sizes.window - 130);
  // The grid has no card around it.
  expect(await grid.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
});

test("should scroll only the grid sideways and keep the page header in view when the sheet scrolls", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid).toBeVisible();
  await expect(async () => {
    await scrollGrid(grid, { top: 5000, left: 3000 });
    expect(await grid.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }).toPass();
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

test("should scroll to the next cell when an editor saves a cell that scrolled out of view", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid.getByRole("gridcell", { name: "r1c1", exact: true })).toBeVisible();
  await grid.focus();
  // Typing starts editing the active cell (r1c1); then the sheet scrolls far away from it.
  await page.keyboard.type("x");
  await expect(page.getByRole("textbox", { name: /row 1$/ })).toBeVisible();
  await scrollGridTo(grid, { top: 40_000 }, grid.getByRole("gridcell", { name: "r1000c1", exact: true }));
  await page.keyboard.press("Enter");
  await expect(grid.getByRole("gridcell", { name: "r2c1", exact: true })).toBeInViewport();
});

test("should slide the sheet's frozen header under the page header when the page scrolls", async ({ page }) => {
  await page.goto("/dev/editor?kind=sheet");
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid).toBeVisible();
  // Room below the sheet, as comments give a real page, then scroll until the grid's top sits under the pinned page header.
  await page.evaluate(() => {
    const room = document.createElement("div");
    room.style.height = "2000px";
    document.body.append(room);
    const box = document.querySelector("[role=grid]")?.getBoundingClientRect();
    if (box) window.scrollBy(0, box.top - 20);
  });
  await expect.poll(() => grid.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(30);
  const banner = page.getByRole("banner");
  const box = await banner.boundingBox();
  if (!box) throw new Error("No page header.");
  const onTop = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("header, [role=banner]")), { x: box.x + box.width / 2, y: box.y + box.height - 4 });
  expect(onTop, "the page header stays above the sheet").toBe(true);
});
