import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };

/**
 * The interface block editor on the artifact page fixture (no database;
 * saves stay in memory): text typed in place, blocks added from "+" and "/",
 * and the block handle's duplicate, delete, and drag. Every check reads the
 * result back from View source, the raw spec that would be saved.
 */

/** The page header, where the save status and the More menu live. */
const pageHeader = (page: Page) => page.getByRole("banner");
const saveStatus = (page: Page) => page.locator("[data-slot=save-indicator]");
const editor = (page: Page) => page.locator("[data-slot=ui-block-editor]");

async function openBlocks(page: Page) {
  await page.goto("/dev/editor?kind=blocks");
  await expect(editor(page).getByRole("textbox", { name: "Heading" })).toHaveText("Launch plan");
}

/** The spec as saved, read from View source, then back to the page. */
async function savedSpec(page: Page): Promise<{ root: string; elements: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }> }> {
  await pageHeader(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = await page.getByRole("textbox", { name: "Artifact source" }).inputValue();
  await pageHeader(page).getByRole("button", { name: "More actions" }).click();
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

test("should refuse a pasted file and offer no media blocks when typing in an interface's Markdown block", async ({ page }) => {
  await openBlocks(page);
  await editor(page).getByRole("button", { name: "Add a block", exact: true }).last().click();
  await page.getByRole("combobox", { name: "Search blocks" }).fill("markdown");
  await page.keyboard.press("Enter");
  const markdown = editor(page).getByRole("textbox", { name: "Markdown" });
  await expect(markdown).toBeVisible();
  await markdown.click();
  await page.keyboard.type("Notes ");

  // A pasted screenshot would never attach to a ui artifact, so the block says so and keeps only the text.
  await markdown.evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], "Screenshot.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page).getByRole("status").filter({ hasText: "Files can’t go in a Markdown block." })).toBeVisible();
  await expect(markdown.locator("[data-media-block]")).toHaveCount(0);

  // The slash menu offers text blocks only.
  await page.keyboard.type("/image");
  await expect(page.getByText("No blocks match.")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  const spec = await savedSpec(page);
  const block = Object.values(spec.elements).find((element) => element.type === "Markdown");
  // The new block's starter text, then what was typed: no media, no file link.
  expect(block?.props?.content).toMatch(/Notes \/image$/u);
  expect(block?.props?.content).not.toContain("/api/files/");
});
