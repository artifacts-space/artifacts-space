import { expect, test } from "@playwright/test";

/**
 * Links into the workspace (from notifications): `?artifact=<id>` selects
 * that artifact, and `&comments=1` opens its Comments dialog. Checked on
 * /dev/workspace, the real workspace without a database.
 */

test("should open the linked artifact with its comments dialog when the link asks for them", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacenote01&comments=1");
  await expect(page.getByRole("region", { name: "Edit Note 2" })).toBeAttached();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Comments on Note 2" })).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("should open the linked artifact at the top when the link does not ask for comments", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=fixtureworkspacenote01");
  await expect(page.getByRole("region", { name: "Edit Note 2" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("should open the first artifact when the linked one does not exist", async ({ page }) => {
  await page.goto("/dev/workspace?artifact=nothingHere&comments=1");
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
});
