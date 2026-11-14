import { expect, test } from "./support/test";

const themes = ["light", "dark"] as const;

for (const theme of themes) {
  test(`should show every component in both panels without errors when the site theme is ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);

    await page.goto("/preview");
    await expect(page.getByRole("heading", { name: "Artifact preview", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });

    // Each panel keeps its own theme whatever the site theme is.
    const light = page.locator('[data-preview-theme="light"]').first();
    const dark = page.locator('[data-preview-theme="dark"]').first();
    await expect(light).toHaveCSS("color-scheme", "light");
    await expect(dark).toHaveCSS("color-scheme", "dark");
    expect(await page.locator("[data-preview-theme]").count()).toBeGreaterThan(80);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
  });
}

test("should apply every preset to both panels and redraw diagrams without errors when switching themes", async ({ page }) => {
  await page.goto("/preview");
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });

  const light = page.locator('[data-preview-theme="light"]').first();
  const dark = page.locator('[data-preview-theme="dark"]').first();
  const diagram = page.locator('[data-preview-item="format:mermaid"] [data-preview-theme="light"] img').first();
  const defaultBackground = await light.evaluate((element) => getComputedStyle(element).backgroundColor);
  const defaultDiagram = await diagram.getAttribute("src");

  const presets = await page.locator("[data-theme-preset]").evaluateAll((buttons) => buttons.map((button) => button.textContent));
  expect(presets.length).toBeGreaterThanOrEqual(6);
  for (const name of presets.slice(1)) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(light).not.toHaveCSS("background-color", defaultBackground);
    await expect(light).toHaveCSS("color-scheme", "light");
    await expect(dark).toHaveCSS("color-scheme", "dark");
    await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
    await expect(diagram).not.toHaveAttribute("src", defaultDiagram ?? "");
  }
});
