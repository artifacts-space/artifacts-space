import type { Locator } from "@playwright/test";

import { expect, test } from "./support/test";

/*
 * Interface blocks follow the width of the interface, not of the window: a
 * narrow interface on a wide window (a pane, a docs example, a canvas frame)
 * gets the narrow layout. Each check sets the interface's own width on a
 * 1440px window and counts the columns its first grid lays out.
 */

test.skip(({ isMobile }) => isMobile, "The window is the narrow part on a phone; these checks need a wide window.");

/** Sets the width of the interface inside `scope` and returns how many columns its first grid has. */
async function columnsAt(scope: Locator, width: number): Promise<number> {
  return scope.evaluate((element, px) => {
    const nodes = [element, ...element.querySelectorAll("*")];
    const root = nodes.find((node) => getComputedStyle(node).containerName === "ui");
    if (!(root instanceof HTMLElement)) throw new Error("No interface found.");
    root.style.width = `${String(px)}px`;
    const grid = [...root.querySelectorAll("*")].find((node) => getComputedStyle(node).display === "grid");
    if (!grid) throw new Error("No grid found.");
    return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  }, width);
}

const specimen = (scope: Locator, group: string, name: string) => scope.locator(`#${group} [data-specimen="${name}"]`);

test("should fit a four-column grid to the interface when the window is wide", async ({ page }) => {
  await page.goto("/dev/components");
  const grid = specimen(page.locator("body"), "Grid", "Four columns");

  expect(await columnsAt(grid, 390)).toBe(1);
  expect(await columnsAt(grid, 600)).toBe(2);
  expect(await columnsAt(grid, 900)).toBe(4);
});

test("should fit a three-column grid to the interface when the window is wide", async ({ page }) => {
  await page.goto("/dev/components");
  const grid = specimen(page.locator("body"), "Grid", "Three columns");

  expect(await columnsAt(grid, 390)).toBe(1);
  expect(await columnsAt(grid, 590)).toBe(2);
  expect(await columnsAt(grid, 620)).toBe(3);
});

test("should fit a two-column key-value list to the interface when the window is wide", async ({ page }) => {
  await page.goto("/dev/components");
  const list = specimen(page.locator("body"), "KeyValue", "Two columns");

  expect(await columnsAt(list, 590)).toBe(1);
  expect(await columnsAt(list, 620)).toBe(2);
});

test("should lay a grid out in columns when the interface is open in the editor", async ({ page }) => {
  await page.goto("/dev/editor?kind=ui");
  const editor = page.locator("[data-slot=ui-block-editor]");
  await expect(editor).toBeVisible();

  expect(await columnsAt(editor, 900)).toBe(3);
  expect(await columnsAt(editor, 390)).toBe(1);
});
