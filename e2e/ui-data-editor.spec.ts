import { expect, test, type Page } from "@playwright/test";

/**
 * Editing the data behind interface blocks (a chart's labels and values, a
 * table's rows, a tab's label) in the properties form, on the artifact page
 * fixture (no database; saves stay in memory). Invalid data never reaches
 * the spec: the form says why and the block keeps its last valid data.
 */

/** The page header, where the save status and the More menu live. */
const pageHeader = (page: Page) => page.getByRole("banner");
const editor = (page: Page) => page.locator("[data-slot=ui-block-editor]");

async function openData(page: Page) {
  await page.goto("/dev/editor?kind=data");
  await expect(editor(page).locator("[data-block=chart]")).toBeVisible();
}

/** The spec as saved, read from View source, then back to the page. */
async function savedProps(page: Page, key: string): Promise<Record<string, unknown>> {
  await pageHeader(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = await page.getByRole("textbox", { name: "Artifact source" }).inputValue();
  await pageHeader(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Hide source" }).click();
  const spec = JSON.parse(source) as { elements: Record<string, { props?: Record<string, unknown> }> };
  return spec.elements[key]?.props ?? {};
}

async function editProperties(page: Page, key: string, type: string) {
  const block = editor(page).locator(`[data-block=${key}]`);
  await block.hover();
  await block.getByRole("button", { name: new RegExp(`^${type} block`) }).first().click();
  await page.getByRole("menuitem", { name: "Edit properties" }).click();
  const dialog = page.getByRole("dialog", { name: `Edit ${type}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("should change a chart's labels and values and hold the change until they match", async ({ page }) => {
  await openData(page);
  const dialog = await editProperties(page, "chart", "Chart");
  await dialog.getByRole("textbox", { name: "Labels" }).fill("Q1\nQ2\nQ3\nQ4");
  await expect(dialog.getByRole("status")).toContainText("3 values but there are 4 labels");
  await dialog.getByRole("textbox", { name: "Values" }).fill("3\n5\n4\n6");
  await expect(dialog.getByRole("status")).toHaveText("Changes save as you type.");
  await page.keyboard.press("Escape");
  const props = await savedProps(page, "chart");
  expect(props.labels).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  expect(props.series).toEqual([{ name: "Orders", values: [3, 5, 4, 6] }]);
});

test("should add a table row from the properties form", async ({ page }) => {
  await openData(page);
  const dialog = await editProperties(page, "table", "Table");
  await dialog.getByRole("button", { name: "Add row" }).click();
  await dialog.getByRole("textbox", { name: "Name, row 2" }).fill("South");
  await dialog.getByRole("textbox", { name: "Orders, row 2" }).fill("8");
  await page.keyboard.press("Escape");
  await expect(editor(page).getByRole("cell", { name: "South" })).toBeVisible();
  expect((await savedProps(page, "table")).rows).toEqual([{ name: "North", orders: 12 }, { name: "South", orders: 8 }]);
});

test("should rename a tab from its properties and keep one label per panel", async ({ page }) => {
  await openData(page);
  const dialog = await editProperties(page, "tabs", "Tabs");
  await expect(dialog.getByRole("button", { name: /^Add tab/ })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Label" }).first().fill("Open risks");
  await page.keyboard.press("Escape");
  await expect(editor(page).getByRole("tab", { name: "Open risks" })).toBeVisible();
  expect((await savedProps(page, "tabs")).tabs).toEqual([{ label: "Open risks" }, { label: "Owners" }]);
});
