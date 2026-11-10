import { expect, type Page, test } from "@playwright/test";

import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * "Allow CSV download", off by default: readers who cannot edit a CSV get
 * no Download CSV or Copy, a 403 for the raw file, Markdown without the
 * rows, and a grid that copies nothing. The author can turn it on from the
 * page's ⋯ menu, and then every reader can. Needs dev sign-in and a local
 * throwaway database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const csv = "name,secret\nalpha,s3cr3t-row\nbeta,another\n";
const created: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, users);
});

/** Puts known text on the real clipboard, and reads it back after a copy. */
async function watchClipboard(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("before the copy"));
  return () => page.evaluate(() => navigator.clipboard.readText());
}

test("should keep a sheet's data from a signed-out reader while downloads are off", async ({ page, request }) => {
  const owner = await createTestUser();
  users.push(owner);
  const publicId = await createTestArtifact({ userId: owner, title: `Locked sheet ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);

  const raw = await request.get(`/artifact/${publicId}/raw`);
  expect(raw.status()).toBe(403);
  expect(await raw.text()).not.toContain("s3cr3t-row");
  const markdown = await (await request.get(`/artifact/${publicId}.md`)).text();
  expect(markdown).toContain("turned off downloads");
  expect(markdown).not.toContain("s3cr3t-row");

  await page.goto(`/artifact/${publicId}`);
  const grid = page.getByRole("grid", { name: "CSV table" });
  await expect(grid.getByRole("gridcell", { name: "s3cr3t-row", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);

  const clipboard = await watchClipboard(page);
  await grid.getByRole("gridcell", { name: "s3cr3t-row", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  // The toast, not the grid's screen-reader hint, which also says copying is off.
  await expect(page.getByText("Copying is off: the owner turned off downloads")).toBeVisible();
  expect(await clipboard()).not.toContain("s3cr3t-row");
});

test("should let the author turn downloads on so every reader can download and copy", async ({ page, browser }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Open sheet ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);
  // The author, an editor, always has the file.
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", `/artifact/${publicId}/raw`);

  await page.getByRole("button", { name: "More actions" }).click();
  const setting = page.getByRole("menuitemcheckbox", { name: "Allow CSV download" });
  await expect(setting).toHaveAttribute("aria-checked", "false");
  await setting.click();
  await expect(page.getByText("Readers can now download and copy this sheet.")).toBeVisible();

  const reader = await browser.newPage();
  const raw = await reader.request.get(`/artifact/${publicId}/raw`);
  expect(raw.status()).toBe(200);
  expect(await raw.text()).toBe(csv);
  await reader.goto(`/artifact/${publicId}`);
  await expect(reader.getByRole("link", { name: "Download CSV" })).toBeVisible();
  await reader.close();
});

test("should give a signed-in reader who cannot edit no setting and no file", async ({ page }) => {
  const owner = await createTestUser();
  users.push(owner);
  const publicId = await createTestArtifact({ userId: owner, title: `Other sheet ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  await page.goto(`/artifact/${publicId}`);
  await expect(page.getByRole("grid", { name: "CSV table" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0);
  const raw = await page.request.get(`/artifact/${publicId}/raw`);
  expect(raw.status()).toBe(403);
});
