import { expect, test, type Page } from "@playwright/test";

import { cleanUp, devUserId, localDatabaseEnabled, localDatabaseSkipReason } from "./support/local-db";
import { cleanUpReplacedFiles, seedReplacedFile, type ReplacedFileSeed } from "./support/replace-file-db";

/**
 * A replaced file in History: the replace shows as "Replaced sow.pdf", an
 * older version offers the file as it was then, and only people who may
 * edit the artifact can open that old copy. Needs dev sign-in and a local
 * throwaway database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const seeds: ReplacedFileSeed[] = [];

test.afterAll(async () => {
  await cleanUpReplacedFiles(seeds);
  await cleanUp(seeds.map((seed) => seed.publicId), []);
});

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
}

test("should show the replace in History and offer the old copy only to people who may edit", async ({ page, browser }, testInfo) => {
  await signIn(page);
  const seed = await seedReplacedFile(await devUserId(), `Replaced file ${testInfo.project.name}`);
  seeds.push(seed);
  await page.goto(`/artifact/${seed.publicId}`);

  await page.getByRole("banner").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
  const list = page.getByRole("list", { name: "Versions" });
  await expect(list.getByRole("button")).toHaveCount(2);
  await expect(list.getByRole("button").first()).toContainText("Replaced sow.pdf");

  // The version from before the replace offers the file as it was then.
  await list.getByRole("button").nth(1).click();
  const replaced = page.getByRole("region", { name: "Files replaced since this version" });
  await expect(replaced).toContainText("sow.pdf");
  const download = replaced.locator('a[aria-label="Download sow.pdf as it was then"]');
  await expect(download).toHaveAttribute("href", `/api/files/${seed.fileId}/copies/${seed.copyId}?download=1`);
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("dialog", { name: "Restore this version?" })).toContainText("Replaced files stay as they are now.");
  await page.keyboard.press("Escape");

  // The author may open the old copy (locally there is no file storage, so it answers 500, never 404); nobody else may.
  const own = await page.request.get(`/api/files/${seed.fileId}/copies/${seed.copyId}`, { maxRedirects: 0 });
  expect(own.status()).not.toBe(404);
  expect(own.headers()["cache-control"]).toBe("private, no-store");
  const stranger = await browser.newContext();
  const refused = await stranger.request.get(`/api/files/${seed.fileId}/copies/${seed.copyId}`, { maxRedirects: 0 });
  await stranger.close();
  expect(refused.status()).toBe(404);
});
