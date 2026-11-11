import { expect, test, type Page } from "@playwright/test";

import { artifactCountOf, artifactsTitled, cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * New artifact against a real database, through the real server actions:
 * an untouched blank page stores no row, and a page with only a title is
 * created once, as Markdown with no body yet, then saves normally. Needs dev
 * sign-in and a local throwaway database; skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.skip(({ isMobile }) => isMobile, "the store is the same on phones; new-artifact.spec.ts covers the phone layout");

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

async function openBlankPage(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const blank = page.getByRole("region", { name: "New artifact" });
  await expect(async () => {
    // With no artifacts yet, the empty pane offers New artifact too; the bar's button comes first.
    await page.getByRole("button", { name: "New artifact" }).first().click();
    await expect(blank).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("region", { name: "Content" }).locator('[contenteditable="true"]')).toBeVisible();
}

test("should store no row when the blank page is left untouched", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  const before = await artifactCountOf(userId);
  await openBlankPage(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "New artifact" }).first()).toBeVisible();
  expect(await artifactCountOf(userId)).toBe(before);
});

test("should create a page with only a title once, then save its body to the same row", async ({ page }) => {
  await openBlankPage(page);
  const userId = await readyDevUser();
  const title = `Title only ${String(Date.now())}`;
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await artifactsTitled(userId, title)).length, { timeout: 15_000 }).toBe(1);
  const [first] = await artifactsTitled(userId, title);
  if (first) created.push(first.publicId);
  expect(first).toMatchObject({ content: "", kind: "markdown", versions: 1 });

  await page.keyboard.type("The body, typed after the title.");
  await expect.poll(async () => (await artifactsTitled(userId, title))[0]?.content, { timeout: 15_000 }).toBe("The body, typed after the title.");
  expect(await artifactsTitled(userId, title)).toHaveLength(1);
});

test("should reopen an artifact made on a blank page with its latest body after New artifact was pressed again", async ({ page }) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  // Another artifact to pick, so the blank page lets go of the new one.
  const otherTitle = `Other ${String(Date.now())}`;
  created.push(await createTestArtifact({ userId, title: otherTitle, content: "Another note.", visibility: "private", theme: null }));
  await openBlankPage(page);
  const title = `Kept copy ${String(Date.now())}`;
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("First body");
  await expect.poll(async () => (await artifactsTitled(userId, title))[0]?.content, { timeout: 15_000 }).toBe("First body");
  const [first] = await artifactsTitled(userId, title);
  if (first) created.push(first.publicId);

  // Edited on its own page after the blank page let go of it.
  const card = page.locator("[data-slot=artifact-list] li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await page.locator("[data-slot=artifact-list] li").filter({ has: page.getByRole("heading", { name: otherTitle, exact: true }) }).click();
  await expect(page.getByRole("region", { name: `Edit ${otherTitle}` })).toBeVisible();
  await card.click();
  const own = page.getByRole("region", { name: `Edit ${title}` }).locator('[contenteditable="true"]');
  await own.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more");
  await expect.poll(async () => (await artifactsTitled(userId, title))[0]?.content, { timeout: 15_000 }).toBe("First body and more");

  // New artifact again, left untouched, then the artifact once more: it opens on the latest body, and the next edit saves.
  await page.getByRole("button", { name: "New artifact" }).first().click();
  await expect(page.getByRole("region", { name: "New artifact" })).toBeVisible();
  await card.click();
  await expect(own).toContainText("First body and more");
  await own.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect.poll(async () => (await artifactsTitled(userId, title))[0]?.content, { timeout: 15_000 }).toBe("First body and more!");
});
