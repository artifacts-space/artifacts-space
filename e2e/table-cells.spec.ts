import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/*
 * Table cells in the rich editor hold what a GFM pipe table stores: one
 * line of inline text (table-shape.ts). On the block menu fixture
 * (/dev/block-menu, the real page editor without a database): Enter in a
 * cell is a line break in the same paragraph, a Markdown block trigger
 * typed in a cell stays text, and the slash menu does not open in a cell.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });

/** Inserts a 3×3 table from the slash menu under the closing paragraph; the caret lands in its first cell. */
async function insertTable(page: Page) {
  await page.goto("/dev/block-menu");
  await expect(editor(page).getByRole("heading", { name: "Four items waiting for you" })).toBeVisible();
  await editor(page).locator(":scope > p").filter({ hasText: "Closing paragraph" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.mouse.move(0, 0);
  await page.keyboard.type("/table");
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("table")).toHaveCount(1);
}

const cells = (page: Page) => editor(page).locator("table").locator("th, td");

test("should keep a cell to one paragraph when Enter is pressed in it", async ({ page }) => {
  await insertTable(page);
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  const first = cells(page).first();
  await expect(first.locator("p")).toHaveCount(1);
  await expect(first.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(1);
  await expect(first).toHaveText("onetwo");
});

test("should keep a list trigger typed in a cell as text", async ({ page }) => {
  await insertTable(page);
  await page.keyboard.type("- item");
  await expect(cells(page).first()).toHaveText("- item");
  await expect(editor(page).locator("table ul, table ol, table blockquote, table h1, table h2")).toHaveCount(0);
});

test("should not open the slash menu when / is typed in a cell", async ({ page }) => {
  await insertTable(page);
  await page.keyboard.type("/");
  await expect(cells(page).first()).toHaveText("/");
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeHidden();
});
