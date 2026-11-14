import { expect, test } from "./support/test";

/**
 * A ThemeScope that follows the reader's light or dark choice (the gallery's
 * "Themes" group, as an artifact page will use it): colors come from
 * light-dark() pairs, resolved by the inherited color-scheme.
 */
test("should follow the site mode and draw diagrams in theme colors when a scope is not locked", async ({ browser }) => {
  const readings: Record<string, { scope: string; backdrop: string; page: string; diagram: string | null }> = {};
  for (const theme of ["light", "dark"] as const) {
    // A fresh context per mode, so the stored site theme starts clean.
    const context = await browser.newContext();
    const page = await context.newPage();
    // Top frame only: the gallery's file stand-ins are data: frames, which have no storage.
    await page.addInitScript((value) => { if (window === window.top) window.localStorage.setItem("theme", value); }, theme);
    await page.goto("/dev/components#themes");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    const scope = page.locator('[data-theme-scope="ocean"]');
    await expect(scope.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
    await expect(scope).toHaveCSS("color-scheme", theme);
    readings[theme] = {
      scope: await scope.evaluate((element) => getComputedStyle(element).getPropertyValue("--card")),
      backdrop: await page.locator('[data-theme-backdrop="ocean"]').evaluate((element) => getComputedStyle(element).backgroundColor),
      page: await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor),
      diagram: await scope.locator("img").first().getAttribute("src"),
    };
    await context.close();
  }
  const { light, dark } = readings;
  if (!light || !dark) throw new Error("missing readings");
  expect(light.scope).toMatch(/^light-dark\(oklch/);
  expect(light.backdrop).not.toBe(light.page);
  expect(dark.backdrop).not.toBe(dark.page);
  expect(light.backdrop).not.toBe(dark.backdrop);
  expect(light.diagram).toBeTruthy();
  expect(light.diagram).not.toBe(dark.diagram);
});
