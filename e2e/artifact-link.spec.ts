import { expect, test } from "@playwright/test";

/**
 * Links into the workspace (from notifications): `?artifact=<id>` selects
 * that artifact, and `&comments=1` brings its comments into view. Checked on
 * /dev/workspace, the real workspace without a database.
 */

test("should open the linked artifact and bring its comments into view when the link asks for them", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacenote00&comments=1");
  await expect(page.getByRole("region", { name: "Edit Note 1" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comments" })).toBeInViewport();
  await expect(page.getByRole("region", { name: "Comments" })).toBeFocused();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
});

test("should open the linked artifact at the top when the link does not ask for comments", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacenote00");
  await expect(page.getByRole("region", { name: "Edit Note 1" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comments" })).not.toBeFocused();
});

test("should open the first artifact when the linked one does not exist", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=nothingHere&comments=1");
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
});
