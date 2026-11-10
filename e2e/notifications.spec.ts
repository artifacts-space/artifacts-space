import { expect, test } from "@playwright/test";

/**
 * The notification bell in the app header, on /dev/workspace: the real header
 * with a seeded list and no database. Server actions fail there, so these
 * checks cover what the person sees and where each row leads.
 */

test("should show the unread count and list notifications newest first when the bell opens", async ({ page }) => {
  await page.goto("/dev/workspace");
  const bell = page.getByRole("button", { name: "Notifications, 4 unread" });
  await expect(bell).toBeVisible();
  await bell.click();

  const popup = page.getByRole("dialog");
  await expect(popup.getByText("Notifications", { exact: true })).toBeVisible();
  const fresh = popup.getByRole("region", { name: "New" });
  const rows = fresh.getByRole("link");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("@ada mentioned you on Long markdown fixture");
  await expect(rows.nth(0)).toContainText("Can you check the rollout plan before Friday?");
  await expect(rows.nth(1)).toContainText("@claude-code for Fixture and @ada commented on");
  await expect(rows.nth(2)).toContainText("asked to share");
  const earlier = popup.getByRole("region", { name: "Earlier" }).getByRole("link");
  await expect(earlier).toHaveCount(3);
  await expect(earlier.nth(0)).toContainText("approved your changes to");
});

test("should open the artifact with its comments, or the team approval queue for a request, when a row is chosen", async ({ page }) => {
  await page.goto("/dev/workspace");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const rows = page.getByRole("dialog").getByRole("region", { name: "New" }).getByRole("link");
  // The fixture's rows open the fixture page; on /app they open /app (src/lib/notifications/display-rules.test.ts).
  await expect(rows.nth(0)).toHaveAttribute("href", "/dev/workspace?artifact=fixtureworkspace000md&comments=1");
  await expect(rows.nth(2)).toHaveAttribute("href", "/teams/fixture?tab=artifacts&view=approval");
});

test("should clear the badge at once when the person marks everything read", async ({ page }) => {
  await page.goto("/dev/workspace");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("dialog").getByRole("region", { name: "New" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});

test("should fit the bell in the header on a narrow phone without a sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/dev/workspace");
  await expect(page.getByRole("button", { name: /^Notifications/ })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeInViewport();
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
