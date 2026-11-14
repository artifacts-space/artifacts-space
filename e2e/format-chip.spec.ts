import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/*
 * The format chip under an artifact's summary in the /app pane. "Markdown"
 * told nobody anything, so a Markdown page shows none; changing the format
 * stays in the More menu. Other formats keep their chip. Measured on
 * /dev/workspace, the real workspace without a database.
 */

const list = (page: Page) => page.locator("[data-slot=artifact-list]");

/** True when the page scrolls sideways. */
function scrollsSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function openArtifact(page: Page, title: RegExp) {
  await page.goto("/dev/workspace");
  await list(page).getByRole("button", { name: title }).click();
}

test.describe("the format chip", () => {
  test("should not show Markdown under the title, and keep the project chip on the title's line", async ({ page }) => {
    await openArtifact(page, /Long markdown fixture/);
    const title = page.getByRole("textbox", { name: "Artifact title" });
    await expect(title).toHaveValue("Long markdown fixture");
    await expect(page.getByRole("button", { name: /^Format: / })).toHaveCount(0);

    const project = page.getByRole("button", { name: /^(Add to project|Project: )/ });
    const [titleBox, projectBox] = await Promise.all([title.boundingBox(), project.boundingBox()]);
    expect(Math.abs((projectBox?.x ?? 0) - (titleBox?.x ?? 0)), "the row starts where the title does").toBeLessThanOrEqual(0.5);
    expect(await scrollsSideways(page)).toBe(false);
  });

  test("should still offer Format and language in the More menu of a Markdown artifact", async ({ page }) => {
    await openArtifact(page, /Long markdown fixture/);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Format and language" }).click();
    await expect(page.getByRole("dialog", { name: "Format and language" })).toBeVisible();
  });

  test("should keep the chip for a format that tells the reader something, such as an interface", async ({ page }) => {
    await openArtifact(page, /Long ui fixture/);
    await expect(page.getByRole("button", { name: "Format: Interface. Change format" })).toBeVisible();
  });
});
