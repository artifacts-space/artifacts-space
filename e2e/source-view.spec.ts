import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/**
 * The way back from an artifact's source. Edit source (or View source in
 * the More menu) puts the raw content in place of the rendered artifact;
 * Hide source sits above it, where Edit source was, on the artifact page
 * (/dev/editor) and in the /app pane (/dev/workspace). No database.
 */

const source = (page: Page) => page.getByRole("textbox", { name: "Artifact source" });
const editSource = (page: Page) => page.getByRole("button", { name: "Edit source" });
const hideSource = (page: Page) => page.getByRole("button", { name: "Hide source" });

/** A button's right edge and top, in page pixels. */
async function corner(button: Locator) {
  const box = await button.boundingBox();
  if (!box) throw new Error("the button is not on the page");
  return { right: box.x + box.width, top: box.y };
}

/** Opens View source from the More menu of the page header or of the /app toolbar. */
async function viewSourceFromMenu(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  await expect(source(page)).toBeVisible();
}

test("should put Hide source where Edit source was, and bring the canvas back with it", async ({ page }) => {
  await page.goto("/dev/editor?kind=canvas");
  await expect(page.getByRole("banner").getByRole("button", { name: "More actions" })).toBeEnabled();
  const before = await corner(editSource(page));
  await editSource(page).click();
  await expect(source(page)).toBeVisible();
  await expect(editSource(page)).toHaveCount(0);

  const after = await corner(hideSource(page));
  expect(Math.abs(after.right - before.right), "Hide source ends where Edit source ended").toBeLessThanOrEqual(1);
  expect(Math.abs(after.top - before.top), "Hide source sits at the height Edit source had").toBeLessThanOrEqual(1);
  await expect(hideSource(page), "the button that arrives takes the focus").toBeFocused();
  await expectNoAxeViolations(page.locator("main"));

  await page.keyboard.press("Enter");
  await expect(source(page)).toHaveCount(0);
  await expect(page.locator("[data-canvas-frame]").first()).toBeVisible();
  await expect(editSource(page), "focus comes back to Edit source").toBeFocused();
});

test("should offer Hide source above a document's source too, and leave the focus alone when a menu opened it", async ({ page }) => {
  await page.goto("/dev/editor?kind=markdown");
  await expect(page.getByRole("banner").getByRole("button", { name: "More actions" })).toBeEnabled();
  await viewSourceFromMenu(page);
  await expect(hideSource(page)).toBeVisible();
  await expect(hideSource(page), "a menu press is not a press of the switch").not.toBeFocused();
  await hideSource(page).click();
  await expect(source(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toBeVisible();
});

test("should offer Hide source above the source in the /app pane", async ({ page, isMobile }) => {
  test.skip(isMobile, "the pane's layout is checked on a desktop window");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  await viewSourceFromMenu(page);
  const field = await source(page).boundingBox();
  const button = await hideSource(page).boundingBox();
  if (!field || !button) throw new Error("the source or its button is not on the page");
  expect(button.y + button.height, "the button sits above the source").toBeLessThanOrEqual(field.y + 1);
  expect(button.x + button.width, "the button ends inside the source's column").toBeLessThanOrEqual(field.x + field.width + 0.5);
  await hideSource(page).click();
  await expect(source(page)).toHaveCount(0);
});
