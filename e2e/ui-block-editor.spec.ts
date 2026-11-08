import { expect, test, type Page } from "@playwright/test";

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };

/**
 * The interface block editor on the artifact page fixture (no database;
 * saves stay in memory): text typed in place, blocks added from "+" and "/",
 * and the block handle's duplicate, delete, and drag. Every check reads the
 * result back from View source, the raw spec that would be saved.
 */

const editorBar = (page: Page) => page.locator("[data-slot=editor-bar]");
const saveStatus = (page: Page) => editorBar(page).getByRole("status");
const editor = (page: Page) => page.locator("[data-slot=ui-block-editor]");

async function openBlocks(page: Page) {
  await page.goto("/dev/editor?kind=blocks");
  await expect(editor(page).getByRole("textbox", { name: "Heading" })).toHaveText("Launch plan");
}

/** The spec as saved, read from View source, then back to the page. */
async function savedSpec(page: Page): Promise<{ root: string; elements: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }> }> {
  await editorBar(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = await page.getByRole("textbox", { name: "Artifact source" }).inputValue();
  await editorBar(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Hide source" }).click();
  return JSON.parse(source) as Awaited<ReturnType<typeof savedSpec>>;
}

const rootChildren = async (page: Page) => {
  const spec = await savedSpec(page);
  return (spec.elements[spec.root]?.children ?? []).map((key) => spec.elements[key]?.type ?? "?");
};

test("should save a heading typed in place without any JSON", async ({ page }) => {
  await openBlocks(page);
  await expect(page.getByRole("tablist", { name: "Editor mode" })).toHaveCount(0);
  const heading = editor(page).getByRole("textbox", { name: "Heading" });
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" for Friday");
  await expect(heading).toHaveText("Launch plan for Friday");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  const spec = await savedSpec(page);
  expect(spec.elements.title?.props?.text).toBe("Launch plan for Friday");
});

test("should add a block from the + button and turn an empty line into a heading with /", async ({ page }) => {
  await openBlocks(page);
  await editor(page).getByRole("button", { name: "Add a block", exact: true }).last().click();
  await page.getByRole("combobox", { name: "Search blocks" }).fill("text");
  await page.keyboard.press("Enter");
  const newLine = editor(page).getByRole("textbox", { name: "Text" }).last();
  await expect(newLine).toBeFocused();
  await page.keyboard.type("/");
  await page.getByRole("combobox", { name: "Search blocks" }).fill("heading 2");
  await page.keyboard.press("Enter");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  expect(await rootChildren(page)).toEqual(["Heading", "Text", "Callout", "Tabs", "Heading"]);
});

test("should duplicate and delete a block from its handle and keep the spec valid", async ({ page }) => {
  await openBlocks(page);
  const callout = editor(page).locator("[data-block=note]");
  await callout.hover();
  await callout.getByRole("button", { name: /Callout block/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  expect(await rootChildren(page)).toEqual(["Heading", "Text", "Callout", "Callout", "Tabs"]);

  const intro = editor(page).locator("[data-block=intro]");
  await intro.hover();
  await intro.getByRole("button", { name: /Text block/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  expect(await rootChildren(page)).toEqual(["Heading", "Callout", "Callout", "Tabs"]);
});

test("should move a block by dragging its handle onto another block", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "dragging needs a mouse");
  await openBlocks(page);
  const tabs = editor(page).locator("[data-block=tabs]");
  await tabs.hover();
  await tabs.getByRole("button", { name: /Tabs block/ }).dragTo(editor(page).locator("[data-block=intro]"), { targetPosition: { x: 20, y: 2 } });
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  expect(await rootChildren(page)).toEqual(["Heading", "Tabs", "Text", "Callout"]);
});
