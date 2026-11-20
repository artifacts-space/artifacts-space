import type { Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * An artifact a visitor cannot read, against a real database: signed out,
 * the address goes to sign-in and keeps the artifact as the way back, the
 * same for an id no artifact has; signed in, the owner gets the artifact
 * and anyone else the 404. Needs dev sign-in and a local throwaway database
 * (support/local-db.ts); skipped otherwise. src/proxy.test.ts holds the
 * same decisions in CI.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, users);
});

/** A private Markdown artifact by `userId`, removed afterwards. */
async function seedPrivate(userId: string, title: string) {
  const publicId = await createTestArtifact({ userId, title, content: "# Notes\n\nA short note.", visibility: "private", theme: null });
  created.push(publicId);
  return publicId;
}

/** Signs in as the dev user and returns its id. */
async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

test("should send a signed-out visitor to sign-in with the artifact as the way back, and show it to its owner after sign-in", async ({ page, browser }) => {
  const ownerId = await signIn(page);
  const publicId = await seedPrivate(ownerId, "Private plan");

  const signedOut = await browser.newContext();
  const visitor = await signedOut.newPage();
  const response = await visitor.goto(`/artifact/${publicId}`);
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(`/artifact/${publicId}`)}$`));
  expect(response?.status(), "the sign-in page, not a 404").toBe(200);
  await expect(visitor.getByRole("heading", { name: "Sign in" })).toBeVisible();
  // An id no artifact has gets the same answer, so the redirect says nothing about which ids exist.
  await visitor.goto("/artifact/zzzzzzzzzzzzzzzzzzzzzz");
  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Fartifact%2Fzzzzzzzzzzzzzzzzzzzzzz$/);
  await signedOut.close();

  // The owner, signed in, follows the same way back and reads the artifact.
  await page.goto(`/sign-in?next=${encodeURIComponent(`/artifact/${publicId}`)}`);
  await expect(page).toHaveURL(new RegExp(`/artifact/${publicId}$`));
  await expect(page.getByRole("heading", { name: "Private plan" })).toBeVisible();
});

test("should still answer 404 when a signed-in person opens an artifact that is not theirs to read", async ({ page }) => {
  await signIn(page);
  const strangerId = await createTestUser();
  users.push(strangerId);
  const publicId = await seedPrivate(strangerId, "Someone else's notes");

  allowPageError(`/artifact/${publicId}`, "The browser logs the 404 this test asks for.");
  const response = await page.goto(`/artifact/${publicId}`);
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(new RegExp(`/artifact/${publicId}$`));
});
