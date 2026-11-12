import { expect, test, type Locator, type Page } from "@playwright/test";

import { choosePlacement, gripInset, gripMenuRule, menuEdge as edge, menuWidth, pointMenuRule, submenuOverlap, submenuWidth } from "../src/components/editor/rich/block-menu/menu-placement";

/*
 * Where the block menu opens, measured by bounding boxes on the dev fixture's
 * tall document (/dev/block-menu?doc=long). The menu opens to the left of the
 * grip, or to its right when the left has no room, centered on the grip and
 * kept 12px inside the window: it slides, never flips above or below.
 * Submenus open on hover, to the right of the menu, overlapping it a little.
 * Nothing slides or zooms as it opens. Boxes can land a hair off a whole
 * pixel, so every check allows a pixel.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const menu = (page: Page) => page.locator("[data-slot=block-menu]");
const grip = (page: Page) => page.getByRole("button", { name: "Block actions" });

function block(page: Page, text: string): Locator {
  return editor(page).locator(":scope > *, li").filter({ hasText: text }).last();
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("No bounding box");
  return box;
}

function near(actual: number, expected: number) {
  expect(Math.abs(actual - expected), `${String(actual)} is not within a pixel of ${String(expected)}`).toBeLessThanOrEqual(1);
}

interface FrameSample {
  placed: boolean;
  opacity: number;
  x: number;
  y: number;
  transform: string;
  animation: string;
}

/**
 * Records the menu's first frames as it opens: whether it is placed, its
 * opacity, its box, and any transform or animation, so the test can check it
 * never shows at one spot and then jumps to another.
 */
async function watchOpening(page: Page) {
  await page.evaluate(() => {
    const frames: FrameSample[] = [];
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

async function openingFrames(page: Page): Promise<FrameSample[]> {
  await expect.poll(() => page.evaluate(() => (window as unknown as { menuFrames: unknown[] }).menuFrames.length)).toBeGreaterThanOrEqual(20);
  return page.evaluate(() => (window as unknown as { menuFrames: FrameSample[] }).menuFrames);
}

/** Scrolls a block to the top, middle, or bottom of the window, hovers it, and opens its menu from the grip. */
async function openFrom(page: Page, text: string, at: ScrollLogicalPosition) {
  await page.goto("/dev/block-menu?doc=long");
  const target = block(page, text);
  await expect(target).toBeVisible();
  await target.evaluate((element, where) => { element.scrollIntoView({ block: where }); }, at);
  await target.hover({ position: { x: 8, y: 6 } });
  await expect(grip(page)).toHaveCount(1);
  await watchOpening(page);
  await grip(page).click();
  await expect(menu(page)).toHaveAttribute("data-placed", "");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No viewport");
  return { grip: await boxOf(grip(page)), block: await boxOf(target), menu: await boxOf(menu(page)), viewport };
}

type Opened = Awaited<ReturnType<typeof openFrom>>;

/** Centered on the grip, then moved only as far as it takes to stay 12px inside the window. */
function expectCenteredOnGrip({ grip: gripBox, menu: menuBox, viewport }: Opened) {
  const centered = gripBox.y + gripBox.height / 2 - menuBox.height / 2;
  near(menuBox.y, Math.min(Math.max(centered, edge), viewport.height - edge - menuBox.height));
  expect(menuBox.y).toBeGreaterThanOrEqual(edge - 1);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height - edge + 1);
}

const middle = "Filler paragraph 20 ";

for (const { width, height, side } of [{ width: 1920, height: 900, side: "left" }, { width: 1280, height: 800, side: "right" }] as const) {
  test.describe(`block menu placement on a ${String(width)}px window`, () => {
    test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
    test.use({ viewport: { width, height } });

    const expectSide = ({ grip: gripBox, menu: menuBox }: Opened) => {
      expect(menuBox.width).toBeCloseTo(menuWidth, 0);
      if (side === "left") near(menuBox.x + menuBox.width, gripBox.x - gripMenuRule.gap);
      else near(menuBox.x, gripBox.x + gripBox.width + gripMenuRule.gap);
    };

    test(`should open to the ${side} of the grip, 12px from the top, for a block at the top of the window`, async ({ page }) => {
      const opened = await openFrom(page, middle, "start");
      // Pins the grip's offset from its block (gripInset) against real layout; the 1588px figure itself is derived in menu-placement.test.ts.
      near(opened.grip.x, opened.block.x - gripInset);
      expect(choosePlacement(gripMenuRule, { left: opened.grip.x, right: opened.grip.x + opened.grip.width }, menuWidth, width)).toBe(side);
      expectSide(opened);
      expectCenteredOnGrip(opened);
      near(opened.menu.y, edge);
    });

    test(`should open to the ${side} of the grip, centered on it, for a block in the middle of the window`, async ({ page }) => {
      const opened = await openFrom(page, middle, "center");
      expectSide(opened);
      expectCenteredOnGrip(opened);
      near(opened.menu.y + opened.menu.height / 2, opened.grip.y + opened.grip.height / 2);
    });

    test(`should open to the ${side} of the grip, 12px from the bottom, for a block at the bottom of the window`, async ({ page }) => {
      const opened = await openFrom(page, middle, "end");
      expectSide(opened);
      expectCenteredOnGrip(opened);
      near(opened.menu.y + opened.menu.height, height - edge);
    });

    test("should open a submenu on hover, to the right of the menu, overlapping it a little", async ({ page }) => {
      const opened = await openFrom(page, middle, "center");
      for (const [row, slot] of [["Change", "block-menu-change"], ["Color", "block-menu-color"]] as const) {
        const item = menu(page).getByRole("menuitem", { name: row });
        await item.hover();
        const submenu = page.locator(`[data-slot=${slot}]`);
        await expect(submenu).toHaveAttribute("data-placed", "");
        const box = await boxOf(submenu);
        near(box.x, opened.menu.x + opened.menu.width - submenuOverlap);
        near(box.width, submenuWidth);
        near(box.y, Math.min((await boxOf(item)).y, height - edge - box.height));
      }
    });
  });
}

test.describe("block menu opening", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
  test.use({ viewport: { width: 1920, height: 900 } });

  test("should open with a short fade only, never sliding, zooming, or showing before its place", async ({ page }) => {
    const opened = await openFrom(page, middle, "center");
    const frames = await openingFrames(page);
    for (const frame of frames) {
      expect(frame.transform).toBe("none");
      expect(frame.animation).toBe("none");
      if (!frame.placed) expect(frame.opacity).toBe(0);
      if (frame.opacity > 0) {
        near(frame.x, opened.menu.x);
        near(frame.y, opened.menu.y);
      }
    }
    await expect(menu(page)).toHaveCSS("transition-property", "opacity");
    await expect(menu(page)).toHaveCSS("transition-duration", "0.15s");
    await expect(menu(page)).toHaveCSS("transition-timing-function", "cubic-bezier(0, 0, 0.2, 1)");
  });
});

test.describe("block menu turning into the phone sheet", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet from the start.");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("should become a sheet along the bottom when the window narrows while it is open", async ({ page }) => {
    await openFrom(page, middle, "center");
    await page.setViewportSize({ width: 500, height: 800 });
    await expect.poll(async () => {
      const sheet = await boxOf(menu(page));
      return [Math.round(sheet.x), Math.round(sheet.width), Math.round(sheet.y + sheet.height)];
    }).toEqual([0, 500, 800]);
    // The floating menu's inline height limit is gone, so the sheet's own (72% of the window) applies.
    expect(await menu(page).evaluate((panel) => [panel.style.left, panel.style.top, panel.style.maxHeight])).toEqual(["", "", ""]);
  });
});

test.describe("block menu width", () => {
  test.skip(({ isMobile }) => isMobile, "On phones the menu is a sheet along the bottom.");
  test.use({ viewport: { width: 1920, height: 900 } });

  test("should show every label and shortcut whole in the menu and its submenus", async ({ page }) => {
    await openFrom(page, middle, "center");
    const cutLabels = (panel: Element) => [...panel.querySelectorAll<HTMLElement>("[role=menuitem] span, [role=menuitemradio] span, kbd")].filter((part) => part.scrollWidth > part.clientWidth).map((part) => `${part.textContent} needs ${String(part.scrollWidth)}px, has ${String(part.clientWidth)}px`);
    expect(await menu(page).evaluate(cutLabels)).toEqual([]);
    for (const [row, slot] of [["Change", "block-menu-change"], ["Color", "block-menu-color"]] as const) {
      await menu(page).getByRole("menuitem", { name: row }).hover();
      const submenu = page.locator(`[data-slot=${slot}]`);
      await expect(submenu).toHaveAttribute("data-placed", "");
      expect(await submenu.evaluate(cutLabels)).toEqual([]);
    }
  });
});

test.describe("block menu placement from a right-click", () => {
  test.skip(({ isMobile }) => isMobile, "Touch screens keep the browser's own long-press menu.");
  test.use({ viewport: { width: 900, height: 700 } });

  test("should open beside the pointer near the bottom-right corner, 12px inside the window", async ({ page }) => {
    await page.goto("/dev/block-menu?doc=long");
    const target = block(page, "The last paragraph of the tall document");
    await expect(target).toBeVisible();
    await target.evaluate((element) => { element.scrollIntoView({ block: "end" }); });
    const box = await boxOf(target);
    const pointer = { x: box.x + box.width - 12, y: box.y + box.height / 2 };
    // The pointer is too close to the window's right edge for the menu to open to its right.
    expect(choosePlacement(pointMenuRule, { left: pointer.x, right: pointer.x }, menuWidth, 900)).toBe("left-start");
    await page.mouse.click(pointer.x, pointer.y, { button: "right" });
    await expect(menu(page)).toHaveAttribute("data-placed", "");
    const placed = await boxOf(menu(page));
    near(placed.x + placed.width, pointer.x - pointMenuRule.gap);
    near(placed.y + placed.height, 700 - edge);
  });
});
