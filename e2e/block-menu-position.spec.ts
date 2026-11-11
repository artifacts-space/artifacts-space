import { expect, test, type Locator, type Page } from "@playwright/test";

import { choosePlacement, menuEdge as edge, menuGap as gap, pointMenuRule } from "../src/components/editor/rich/block-menu/menu-placement";

/*
 * Where the block menu opens, measured by bounding boxes on the dev fixture's
 * tall document (/dev/block-menu?doc=long). With room on the left, the menu
 * opens to the left of the block's handle, top-aligned with the block, and
 * slides up rather than flipping when the window is short below it. Without
 * that room, it opens below the block, aligned to the handle. It never
 * covers the handle or the block, and it opens without sliding or zooming.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const menu = (page: Page) => page.locator("[data-slot=block-menu]");
const changeMenu = (page: Page) => page.locator("[data-slot=block-menu-change]");
const handle = (page: Page) => page.locator("[data-slot=block-handle]");

function block(page: Page, text: string): Locator {
  return editor(page).locator(":scope > *, li").filter({ hasText: text }).last();
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("No bounding box");
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Records the menu's first frames as it opens: whether it is placed, its
 * opacity, its box, and any transform or animation, so the test can check it
 * never shows at one spot and then jumps to another.
 */
async function watchOpening(page: Page) {
  await page.evaluate(() => {
    const frames: { placed: boolean; opacity: number; x: number; y: number; transform: string; animation: string }[] = [];
    Object.assign(window, { menuFrames: frames });
    const sample = () => {
      const panel = document.querySelector<HTMLElement>("[data-slot=block-menu]");
      if (panel) {
        const style = getComputedStyle(panel);
        const box = panel.getBoundingClientRect();
        frames.push({ placed: panel.dataset.placed !== undefined, opacity: Number(style.opacity), x: box.x, y: box.y, transform: style.transform, animation: style.animationName });
      }
      if (frames.length < 20) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function openingFrames(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { menuFrames: unknown[] }).menuFrames.length)).toBeGreaterThanOrEqual(20);
  return page.evaluate(() => (window as unknown as { menuFrames: { placed: boolean; opacity: number; x: number; y: number; transform: string; animation: string }[] }).menuFrames);
}

/** Hovers a block (scrolled to the bottom of the window first for "bottom") and opens its menu from the grip. */
async function openFrom(page: Page, text: string, at: "top" | "bottom") {
  const target = block(page, text);
  await expect(target).toBeVisible();
  if (at === "bottom") await target.evaluate((element) => { element.scrollIntoView({ block: "end" }); });
  await target.hover({ position: { x: 8, y: 6 } });
  await expect(handle(page)).toHaveCount(1);
  await watchOpening(page);
  await handle(page).getByRole("button", { name: "Block actions" }).click();
  await expect(menu(page)).toHaveAttribute("data-placed", "");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No viewport");
  return { handle: await boxOf(handle(page)), block: await boxOf(target), menu: await boxOf(menu(page)), viewport };
}

type Opened = Awaited<ReturnType<typeof openFrom>>;

/** To the left of the handle, top-aligned with the block, moved only as far as it takes to stay in the window. */
function expectBeside({ handle: handleBox, block: blockBox, menu: menuBox, viewport }: Opened) {
  expect(Math.abs(menuBox.x + menuBox.width - (handleBox.x - gap))).toBeLessThanOrEqual(1);
  const top = Math.min(Math.max(blockBox.y, edge), viewport.height - edge - menuBox.height);
  expect(Math.abs(menuBox.y - top)).toBeLessThanOrEqual(1);
  expect(menuBox.y).toBeGreaterThanOrEqual(edge - 1);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height - edge + 1);
  expect(overlaps(menuBox, handleBox)).toBe(false);
  expect(overlaps(menuBox, blockBox)).toBe(false);
}

test.describe("block menu placement", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
  test.use({ viewport: { width: 1920, height: 900 } });

  test("should open to the left of the handle, top-aligned with a block near the top", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Written November 11", "top");
    expectBeside(opened);
    expect(Math.abs(opened.menu.y - opened.block.y)).toBeLessThanOrEqual(1);
  });

  test("should stay to the left of the handle near the bottom, moving up instead of flipping above", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Open with you", "bottom");
    expectBeside(opened);
    // The block is too low for the menu to start at its top: the menu ends at the window's edge instead.
    expect(Math.abs(opened.menu.y + opened.menu.height - (opened.viewport.height - edge))).toBeLessThanOrEqual(1);
  });

  test("should open without sliding, zooming, or showing anywhere before its place", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Written November 11", "top");
    const frames = await openingFrames(page);
    for (const frame of frames) {
      expect(frame.transform).toBe("none");
      expect(frame.animation).toBe("none");
      if (!frame.placed) expect(frame.opacity).toBe(0);
      if (frame.opacity > 0) {
        expect(Math.abs(frame.x - opened.menu.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(frame.y - opened.menu.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("should open Change below its row, over the menu, when it has no room to the left", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Written November 11", "top");
    const change = menu(page).getByRole("menuitem", { name: "Change" });
    // Passing over the row must not open a submenu that would cover the rows under it.
    await change.hover();
    await expect(changeMenu(page)).toBeHidden();
    await change.click();
    await expect(changeMenu(page)).toHaveAttribute("data-placed", "");
    const row = await boxOf(change);
    const submenu = await boxOf(changeMenu(page));
    expect(Math.abs(submenu.x - row.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(submenu.y - (row.y + row.height + gap))).toBeLessThanOrEqual(1);
    expect(overlaps(submenu, opened.handle)).toBe(false);
    expect(overlaps(submenu, opened.block)).toBe(false);
  });
});

test.describe("block menu placement on a very wide window", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
  test.use({ viewport: { width: 2560, height: 900 } });

  test("should open Change to the left of its row, top-aligned, on hover", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Written November 11", "top");
    expectBeside(opened);
    const change = menu(page).getByRole("menuitem", { name: "Change" });
    await change.hover();
    await expect(changeMenu(page)).toHaveAttribute("data-placed", "");
    const row = await boxOf(change);
    const submenu = await boxOf(changeMenu(page));
    expect(Math.abs(submenu.x + submenu.width - (row.x - gap))).toBeLessThanOrEqual(1);
    expect(Math.abs(submenu.y - row.y)).toBeLessThanOrEqual(1);
    expect(overlaps(submenu, opened.handle)).toBe(false);
    expect(overlaps(submenu, opened.block)).toBe(false);
  });
});

test.describe("block menu placement on a narrow window", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
  test.use({ viewport: { width: 1024, height: 768 } });

  test("should open below the block, aligned to the handle, when the left has no room", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const opened = await openFrom(page, "Written November 11", "top");
    expect(Math.abs(opened.menu.x - Math.max(opened.handle.x, edge))).toBeLessThanOrEqual(1);
    expect(Math.abs(opened.menu.y - (opened.block.y + opened.block.height + gap))).toBeLessThanOrEqual(1);
    expect(overlaps(opened.menu, opened.handle)).toBe(false);
    expect(overlaps(opened.menu, opened.block)).toBe(false);
  });
});

test.describe("block menu placement from a right-click", () => {
  test.skip(({ isMobile }) => isMobile, "Touch screens keep the browser's own long-press menu.");
  test.use({ viewport: { width: 900, height: 700 } });

  test("should open beside the pointer near the bottom-right corner, moving up instead of flipping", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const target = block(page, "The last paragraph of the tall document");
    await expect(target).toBeVisible();
    await target.evaluate((element) => { element.scrollIntoView({ block: "end" }); });
    const box = await boxOf(target);
    const pointer = { x: box.x + box.width - 12, y: box.y + box.height / 2 };
    // The pointer is too close to the window's right edge for the menu to open to its right.
    expect(choosePlacement(pointMenuRule, { left: pointer.x, right: pointer.x }, 300, 900)).toBe("left-start");
    await page.mouse.click(pointer.x, pointer.y, { button: "right" });
    await expect(menu(page)).toHaveAttribute("data-placed", "");
    const placed = await boxOf(menu(page));
    expect(Math.abs(placed.x + placed.width - (pointer.x - gap))).toBeLessThanOrEqual(1);
    // Too low for the menu to start at the pointer: it ends at the window's edge instead of opening above.
    expect(Math.abs(placed.y + placed.height - (700 - edge))).toBeLessThanOrEqual(1);
    expect(placed.y).toBeGreaterThanOrEqual(edge - 1);
  });
});
