import { expect, test, type Page } from "@playwright/test";

/*
 * The Share dialog's "Show in search engines" switch, on /dev/workspace (the
 * real workspace with fixture artifacts and no database). Nothing is saved:
 * the test only checks what the person sees before they press Save.
 */

async function openShareDialog(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await page.getByRole("button", { name: "Share settings" }).click();
  return page.getByRole("dialog");
}

test("should offer search engines only under Public, off by default", async ({ page }) => {
  const dialog = await openShareDialog(page);
  const readers = dialog.getByRole("radiogroup", { name: "Who can read it" });
  const searchSwitch = dialog.getByRole("switch", { name: "Show in search engines" });

  await expect(searchSwitch).toHaveCount(0);
  await readers.getByRole("radio", { name: /Link/ }).click();
  await expect(searchSwitch).toHaveCount(0);

  await readers.getByRole("radio", { name: /Public/ }).click();
  await expect(searchSwitch).toBeVisible();
  await expect(searchSwitch).not.toBeChecked();
  await expect(dialog.getByText("When on, Google and other search engines can list this page.")).toBeVisible();

  await searchSwitch.click();
  await expect(searchSwitch).toBeChecked();

  await readers.getByRole("radio", { name: /Team/ }).click();
  await expect(searchSwitch).toHaveCount(0);
});
