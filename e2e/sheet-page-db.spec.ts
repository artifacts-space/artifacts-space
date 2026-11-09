import { expect, test } from "@playwright/test";

import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason } from "./support/local-db";

/**
 * A CSV on its own artifact page, as a reader opens it: the sheet spans the
 * window and fills it down to the bottom, with no sideways page scroll. The
 * gallery and /dev/editor checks in sheet-grid.spec.ts cover the grid; this
 * one covers the real page's wiring. Needs a local throwaway database
 * (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, users);
});

const csv = ["id,name,amount", ...Array.from({ length: 200 }, (_, index) => `${String(index + 1)},Item ${String(index + 1)},${String(index * 3)}`)].join("\n");

test("should span the window and fill it to the bottom when a reader opens a CSV artifact page", async ({ page }) => {
  const owner = await createTestUser();
  users.push(owner);
  const publicId = await createTestArtifact({ userId: owner, title: `Sheet page ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);
  const grid = page.getByRole("grid", { name: "CSV table" });
  await expect(grid.getByRole("gridcell", { name: "Item 1", exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-full-width", "true");

  const measure = () => grid.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { bottom: window.innerHeight - box.bottom, width: box.width, window: window.innerWidth };
  });
  // At the top of the page, the sheet reaches down to just above the bottom of the window.
  await expect.poll(async () => { const { bottom } = await measure(); return bottom >= 0 && bottom <= 40; }).toBe(true);
  const { width, window: windowWidth } = await measure();
  expect(width).toBeGreaterThan(windowWidth - 130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
