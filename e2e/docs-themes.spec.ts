import { expect, test } from "./support/test";

/**
 * The themes docs page: every preset shows a live light and dark sample,
 * drawn by the real ThemeScope in the preset's own fonts, and the page never
 * scrolls sideways on a phone.
 */

test("should draw every preset in light and dark when the gallery comes into view", async ({ page }) => {
  await page.goto("/docs/themes");
  const gallery = page.getByRole("list", { name: "Theme presets" });
  const presets = gallery.locator("[data-theme-preset]");
  await expect(presets).toHaveCount(8);

  for (const preset of await presets.all()) {
    await preset.scrollIntoViewIfNeeded();
    await expect(preset.locator('[data-theme-sample-mode="light"]')).toBeVisible();
    await expect(preset.locator('[data-theme-sample-mode="dark"]')).toBeVisible();
  }

  await expect(page.locator('[data-theme-sample="classic"][data-theme-sample-mode="light"]')).toHaveCSS("font-family", /^Roboto/);
  await expect(page.locator('[data-theme-sample="editorial"][data-theme-sample-mode="light"] p.font-heading')).toHaveCSS("font-family", /^"Instrument Serif"/);
  await expect(page.locator('[data-theme-sample="editorial"][data-theme-sample-mode="dark"]')).toHaveClass(/\bdark\b/);
});

test("should copy a preset id when its copy button is pressed", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are a Chromium feature");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/themes");
  await page.getByRole("button", { name: "Copy the Paper preset id" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("paper");
});

test("should not scroll sideways when the themes page is read", async ({ page }) => {
  await page.goto("/docs/themes");
  await page.getByRole("list", { name: "Theme presets" }).scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
