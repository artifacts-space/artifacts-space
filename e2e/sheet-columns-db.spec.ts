import { expect, type Locator, type Page, test } from "@playwright/test";

import { closeInlineEditDb, storedText } from "./support/inline-edit-db";
import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * Moving a column on a CSV artifact's page: an editor's move changes the
 * file and saves through autosave, as in a spreadsheet; a reader's move
 * changes only their own view and never the stored file. Needs dev sign-in
 * and a local throwaway database (support/local-db.ts); skipped otherwise.
 * Dragging needs a mouse, so it runs on the desktop.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.skip(({ isMobile }) => isMobile, "dragging a header needs a mouse");
test.describe.configure({ mode: "serial" });

const csv = "alpha,beta,gamma\n1,2,3\n4,5,6\n";
const created: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await closeInlineEditDb();
  await cleanUp(created, users);
});

const headerNames = (grid: Locator) => grid.locator("[role=columnheader][data-cell]").evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));

/** Drags a column header far enough past its right-hand neighbour to swap them. */
async function dragRightOfNext(page: Page, header: Locator) {
  const box = await header.boundingBox();
  if (!box) throw new Error("No header to drag.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 1.2, y, { steps: 4 });
  await page.mouse.move(box.x + box.width * 1.6, y, { steps: 4 });
  await page.mouse.up();
}

test("should save the new column order in the file when an editor drags a header", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Sheet move ${String(Date.now())}`, content: csv, visibility: "private", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);
  const grid = page.getByRole("grid", { name: "CSV grid editor" });
  await expect(grid.getByRole("columnheader", { name: /^alpha/ })).toBeVisible();

  await dragRightOfNext(page, grid.getByRole("columnheader", { name: /^alpha/ }));
  await expect.poll(() => headerNames(grid)).toEqual(["beta", "alpha", "gamma"]);
  await expect(page.getByText("Everyone sees the new order.")).toBeVisible();
  await expect.poll(async () => (await storedText(publicId)).content, { timeout: 15_000 }).toBe("beta,alpha,gamma\n2,1,3\n5,4,6\n");
});

test("should keep a reader's column order to their own view and leave the file alone", async ({ page }) => {
  const owner = await createTestUser();
  users.push(owner);
  const publicId = await createTestArtifact({ userId: owner, title: `Sheet view ${String(Date.now())}`, content: csv, visibility: "public", theme: null, kind: "csv" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);
  const grid = page.getByRole("grid", { name: "CSV table" });
  await expect(grid.getByRole("columnheader", { name: /^alpha/ })).toBeVisible();

  await dragRightOfNext(page, grid.getByRole("columnheader", { name: /^alpha/ }));
  await expect.poll(() => headerNames(grid)).toEqual(["beta", "alpha", "gamma"]);
  await expect(page.getByText("Only you see this order.")).toBeVisible();

  await page.reload();
  await expect.poll(() => headerNames(page.getByRole("grid", { name: "CSV table" }))).toEqual(["beta", "alpha", "gamma"]);
  expect((await storedText(publicId)).content).toBe(csv);
});
