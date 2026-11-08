import { expect, test } from "@playwright/test";

/**
 * The Views dialog (the gallery's "views dialog" specimen, the same dialog
 * editors open from the /app toolbar), with fixture numbers and no database:
 * totals, the per-day chart, the 30/90 day switch, top sites, and the note
 * on an artifact that is not public.
 */
test("should show totals, a daily chart, and top sites when an editor opens Views on a public artifact", async ({ page }) => {
  await page.goto("/dev/components#views");
  const fixture = page.locator('[data-views-fixture="public"]');
  await fixture.getByRole("button", { name: "Views" }).click();

  const dialog = page.getByRole("dialog", { name: "Views of Launch plan" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-stat="Views"]')).toHaveText("555");
  await expect(dialog.locator('[data-stat="Visitors"]')).toHaveText("265");
  await expect(dialog.getByRole("img", { name: /line chart of Views per day: 2 series over 30 labels/ })).toBeVisible();
  await expect(dialog.locator("[data-referrer]")).toHaveText([/news\.ycombinator\.com\s*120/, /github\.com\s*48/, /x\.com\s*12/]);
  await expect(dialog.getByText(/Views are counted while an artifact is public/)).toHaveCount(0);

  await dialog.getByRole("button", { name: "90 days" }).click();
  await expect(dialog.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator('[data-stat="Views"]')).toHaveText("1,701");
  await expect(dialog.getByRole("img", { name: /over 90 labels/ })).toBeVisible();

  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(width.scroll, "no horizontal page scroll").toBeLessThanOrEqual(width.inner + 1);
});

test("should say views are counted only while public when an editor opens Views on a private artifact", async ({ page }) => {
  await page.goto("/dev/components#views");
  await page.locator('[data-views-fixture="private"]').getByRole("button", { name: "Views" }).click();

  const dialog = page.getByRole("dialog", { name: "Views of Draft notes" });
  await expect(dialog.getByRole("note")).toHaveText("Views are counted while an artifact is public.");
  await expect(dialog.locator('[data-stat="Views"]')).toHaveText("0");
  await expect(dialog.getByRole("img", { name: /chart/ })).toHaveCount(0);
});
