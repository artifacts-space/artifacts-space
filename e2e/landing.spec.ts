import { expect, test } from "@playwright/test";

const themes = ["light", "dark"] as const;

for (const theme of themes) {
  test(`should say why artifacts.space exists without sideways scroll when the site theme is ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Keep your artifacts when you switch agents or accounts." })).toBeVisible();
    const why = page.getByRole("region", { name: "Why we built artifacts.space" });
    await why.scrollIntoViewIfNeeded();
    await expect(why).toBeVisible();
    await expect(why.getByText("Switch accounts. Lose nothing.")).toBeVisible();
    await expect(why.getByText("Every agent sees the same artifacts.")).toBeVisible();
    await expect(why.getByText("Your team sees them too.")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
  });
}

test("should set the header nav links in medium weight when the landing page loads", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Sign in" })).toHaveCSS("font-weight", "500");
});

test("should show one free plan with a single call to action below its copy when the pricing section loads", async ({ page }) => {
  await page.goto("/");
  const pricing = page.getByRole("region", { name: "Pricing" });
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.getByRole("heading", { name: "Free", level: 3 })).toBeVisible();
  await expect(pricing.getByText("$0")).toBeVisible();
  await expect(pricing.getByText("Free forever for everyone who signs up now.")).toBeVisible();

  const cta = pricing.locator('a[href="/sign-up"]');
  await expect(cta).toHaveCount(1);
  const promise = await pricing.getByText("Free forever for everyone who signs up now.").boundingBox();
  const button = await cta.boundingBox();
  expect(promise && button && button.y > promise.y + promise.height, "the button sits below the copy").toBe(true);
});

for (const width of [640, 768, 1024]) {
  test(`should fit the header without sideways scroll when the window is ${String(width)}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
    const fit = await page.getByRole("navigation", { name: "Main navigation" }).evaluate((nav) => {
      const logo = nav.parentElement?.firstElementChild?.getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      return { navRight: box.right, gap: logo ? box.left - logo.right : -1 };
    });
    expect(fit.navRight).toBeLessThanOrEqual(width);
    expect(fit.gap, "the nav must not touch the logo").toBeGreaterThanOrEqual(16);
  });
}
