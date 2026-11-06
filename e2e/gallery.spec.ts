import { expect, test } from "@playwright/test";

const themes = ["light", "dark"] as const;

for (const theme of themes) {
  test(`should render the component gallery without errors when the theme is ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 500));
    });
    // Any alert means content ran code. Nothing in the gallery may do that.
    page.on("dialog", (dialog) => {
      errors.push(`Unexpected dialog: ${dialog.message()}`);
      void dialog.dismiss();
    });
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);

    await page.goto("/dev/components");
    await expect(page.getByRole("heading", { name: "Component gallery" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    // Mermaid draws in the browser; wait until every diagram has either an image or a notice.
    await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);

    const path = testInfo.outputPath(`gallery-${testInfo.project.name}-${theme}.png`);
    await page.screenshot({ fullPage: true, path });
    await testInfo.attach("gallery", { path, contentType: "image/png" });
  });
}
