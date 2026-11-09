import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Sheet formatting: banded rows and each column's alignment. Readers see
 * what the editors saved; editors change it from the Banding menu and each
 * column's menu. The gallery shows a saved format read-only; the editor
 * fixture (/dev/editor) keeps changes in memory, so these run without a
 * database. sheet-format-db.spec.ts covers saving on a real page.
 */

const background = (element: Locator) => element.evaluate((node) => getComputedStyle(node).backgroundColor);
const justify = (element: Locator) => element.evaluate((node) => getComputedStyle(node).justifyContent);
const row = (grid: Locator, index: number) => grid.locator(`[role=row][aria-rowindex="${String(index + 2)}"]`);

async function openEditorSheet(page: Page, query = "") {
  await page.goto(`/dev/editor?kind=sheet${query}`);
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid.getByRole("gridcell").first()).toBeVisible();
  return grid;
}

test("should show a saved banding and column alignment to a reader without the controls to change them", async ({ page }) => {
  await page.goto("/dev/components#formats");
  const specimen = page.locator('[data-specimen="csv · Banded sheet, names centered"]');
  const grid = specimen.getByRole("grid", { name: "CSV table" });
  await grid.scrollIntoViewIfNeeded();
  await expect(row(grid, 1)).toBeVisible();

  expect(await background(row(grid, 1)), "every other row is tinted").not.toBe(await background(row(grid, 0)));
  // name is centered, amount (numbers) is left as chosen, id (numbers) stays right on auto.
  expect(await justify(row(grid, 0).getByRole("gridcell").nth(1))).toBe("center");
  expect(await justify(row(grid, 0).getByRole("gridcell").nth(2))).toBe("normal");
  expect(await justify(row(grid, 0).getByRole("gridcell").nth(0))).toBe("flex-end");

  await expect(specimen.getByRole("button", { name: "Banding" })).toHaveCount(0);
  await grid.getByRole("button", { name: "Sort and filter name" }).click({ force: true });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("group", { name: "Align column" })).toHaveCount(0);
});

test("should band every other row when an editor picks a banding", async ({ page }) => {
  const grid = await openEditorSheet(page);
  await page.mouse.move(0, 0);
  const plain = await background(row(grid, 1));
  expect(plain).toBe(await background(row(grid, 0)));

  await page.getByRole("button", { name: "Banding" }).click();
  await page.getByRole("menuitemradio", { name: "Gray" }).click();
  // Off the rows, so a hover tint does not count as banding.
  await page.mouse.move(0, 0);
  await expect.poll(() => background(row(grid, 1))).not.toBe(plain);
  expect(await background(row(grid, 0))).toBe(plain);

  await page.getByRole("button", { name: "Banding" }).click();
  await page.getByRole("menuitemradio", { name: "Off" }).click();
  await page.mouse.move(0, 0);
  await expect.poll(() => background(row(grid, 1))).toBe(plain);
});

test("should align a column's cells when an editor picks an alignment from its menu", async ({ page }) => {
  const grid = await openEditorSheet(page);
  const cell = row(grid, 0).getByRole("gridcell").first();
  await grid.getByRole("button", { name: /^Edit column/ }).first().click({ force: true });
  const align = page.getByRole("group", { name: "Align column" });
  await expect(align.getByRole("button", { name: "Align automatically" })).toHaveAttribute("aria-pressed", "true");

  await align.getByRole("button", { name: "Align center" }).click();
  await expect(align.getByRole("button", { name: "Align center" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => justify(cell)).toBe("center");

  await align.getByRole("button", { name: "Align automatically" }).click();
  await expect.poll(() => justify(cell)).not.toBe("center");
});

test("should say so once and put the saved formatting back when a change does not save", async ({ page }) => {
  const grid = await openEditorSheet(page, "&save=fail");
  await page.mouse.move(0, 0);
  const plain = await background(row(grid, 1));

  await page.getByRole("button", { name: "Banding" }).click();
  await page.getByRole("menuitemradio", { name: "Gray" }).click();
  await page.mouse.move(0, 0);
  const notice = page.locator("[data-sonner-toast]").filter({ hasText: "Something went wrong. Check your connection and try again." });
  await expect(notice).toHaveCount(1);
  await expect.poll(() => background(row(grid, 1)), "the banding that did not save goes away").toBe(plain);
  await expect(notice, "one failed save, one notice").toHaveCount(1);
});
