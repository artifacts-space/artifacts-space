import { expect, test, type Page } from "@playwright/test";

import { readColors } from "./support/colors";

/**
 * The /app editor shows a themed artifact in its theme, as on its page,
 * as it reads and in View source, while the toolbar keeps the app's look. Checked on
 * /dev/workspace, the real workspace without a database, where Note 9 uses
 * the Ocean theme and Note 10 has none.
 */

async function open(page: Page, publicId: string, title: string) {
  await page.goto(`/dev/workspace?artifact=${publicId}`);
  const editor = page.getByRole("region", { name: `Edit ${title}` });
  await expect(editor).toBeVisible();
  return editor;
}

/** The preview body's surface and text, and the toolbar's History button, as a reader sees them. */
async function readPreview(page: Page, publicId: string, title: string) {
  const editor = await open(page, publicId, title);
  const surface = editor.locator("[data-content-theme]");
  const text = surface.getByText(/^Note 10\.$|The preview wears/);
  await expect(text).toBeVisible();
  return {
    body: await readColors(text),
    toolbar: await readColors(editor.getByRole("button", { name: "History" })),
  };
}

test("should show a themed artifact in its theme in the preview while the toolbar keeps the app's look", async ({ page }) => {
  const plain = await readPreview(page, "fixtureworkspacenote09", "Note 10");
  const themed = await readPreview(page, "fixtureworkspacenote08", "Note 9");

  expect(themed.body.background, "the preview sits on the theme's page color").not.toBe(plain.body.background);
  expect(themed.body.text, "the preview text takes the theme's ink").not.toBe(plain.body.text);
  expect(themed.body.contrast, "the themed preview stays readable").toBeGreaterThanOrEqual(4.5);
  expect(themed.toolbar, "the toolbar stays in the app theme").toEqual(plain.toolbar);
});

test("should keep the artifact's theme when an editor opens View source", async ({ page }) => {
  const editor = await open(page, "fixtureworkspacenote08", "Note 9");
  const previewSurface = await readColors(editor.locator("[data-content-theme]").getByText(/The preview wears/));
  await editor.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = editor.getByRole("textbox", { name: "Artifact source" });
  await expect(source).toBeVisible();
  const editSurface = await readColors(source);
  expect(editSurface.background, "the source sits on the same theme color as the preview").toBe(previewSurface.background);
  expect(editSurface.contrast, "the source stays readable").toBeGreaterThanOrEqual(4.5);
});

test("should swap the preview's theme in place when another artifact is opened", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "Phones show the list and the editor one at a time.");
  const editor = await open(page, "fixtureworkspacenote08", "Note 9");
  const themed = await readColors(editor.locator("[data-content-theme]").getByText(/The preview wears/));
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: /^Note 10\b/ }).click();
  const next = page.getByRole("region", { name: "Edit Note 10" });
  const text = next.locator("[data-content-theme]").getByText(/^Note 10\.$/);
  await expect(text).toBeVisible();
  const plain = await readColors(text);
  expect(plain.background, "the unthemed artifact is back on the app's card").not.toBe(themed.background);
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: /^Note 9\b/ }).click();
  await expect(page.getByRole("region", { name: "Edit Note 9" })).toBeVisible();
  expect(await readColors(page.locator("[data-content-theme]").getByText(/The preview wears/))).toEqual(themed);
});
