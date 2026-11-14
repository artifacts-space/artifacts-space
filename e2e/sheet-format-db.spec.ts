import type { Locator } from "@playwright/test";
import { expect, test } from "./support/test";

import { closeInlineEditDb, storedSheetFormat } from "./support/inline-edit-db";
import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * Sheet formatting on a CSV artifact's page: an editor's banding and column
 * alignment save on the artifact at once (no version in History), and every
 * reader then sees them, without the controls. Needs dev sign-in and a local
 * throwaway database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const csv = "name,amount\nalpha,1\nbeta,2\ngamma,3\n";
const created: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await closeInlineEditDb();
  await cleanUp(created, users);
});

const background = (element: Locator) => element.evaluate((node) => getComputedStyle(node).backgroundColor);
const justify = (element: Locator) => element.evaluate((node) => getComputedStyle(node).justifyContent);
const row = (grid: Locator, index: number) => grid.locator(`[role=row][aria-rowindex="${String(index + 2)}"]`);

test("should save banding and alignment for every reader when an editor sets them, with no new version", async ({ page, browser }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Sheet format ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  const before = await storedSheetFormat(publicId);
  await page.goto(`/artifact/${publicId}`);
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(row(grid, 1)).toBeVisible();

  await page.getByRole("button", { name: "Banding" }).click();
  await page.getByRole("menuitemradio", { name: "Accent" }).click();
  await expect.poll(async () => (await storedSheetFormat(publicId)).format).toMatchObject({ banding: "accent" });

  await grid.getByRole("button", { name: "Edit column name" }).click({ force: true });
  await page.getByRole("group", { name: "Align column" }).getByRole("button", { name: "Align right" }).click();
  await expect.poll(async () => (await storedSheetFormat(publicId)).format).toEqual({ banding: "accent", align: { '="name"': "right" } });
  expect((await storedSheetFormat(publicId)).versions, "formatting files no version").toBe(before.versions);

  // A signed-out reader sees the same formatting and no way to change it.
  const reader = await browser.newPage();
  await reader.goto(`/artifact/${publicId}`);
  const readerGrid = reader.getByRole("grid", { name: "CSV table" });
  await expect(row(readerGrid, 1)).toBeVisible();
  expect(await background(row(readerGrid, 1))).not.toBe(await background(row(readerGrid, 0)));
  expect(await justify(row(readerGrid, 0).getByRole("gridcell").first())).toBe("flex-end");
  await expect(reader.getByRole("button", { name: "Banding" })).toHaveCount(0);
  await reader.close();
});

test("should give a signed-in reader who cannot edit no Banding menu and leave the formatting alone", async ({ page }) => {
  const owner = await createTestUser();
  users.push(owner);
  const publicId = await createTestArtifact({ userId: owner, title: `Sheet format reader ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  await page.goto(`/artifact/${publicId}`);
  await expect(page.getByRole("grid", { name: "CSV table" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Banding" })).toHaveCount(0);
  expect((await storedSheetFormat(publicId)).format).toBeNull();
});
