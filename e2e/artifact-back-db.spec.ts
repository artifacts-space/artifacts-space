import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * Back to an artifact page its editor left, against a real database: the
 * browser shows the page it kept, whose editor was destroyed while it was
 * away, and the page must come back with its text, editable, and no error
 * (the page-error check in support/test.ts fails the test on one). Needs
 * dev sign-in and a local throwaway database (support/local-db.ts); skipped
 * otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

test("should show the artifact again, editable, when its editor goes to the workspace and presses Back", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Back ${testInfo.project.name}`, content: "First draft.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  const body = page.getByRole("textbox", { name: "Artifact content" });
  await body.getByText("First draft.").click();
  await page.getByRole("banner").getByRole("link", { name: "artifacts.space home" }).click();
  await page.waitForURL(/\/app/);

  await page.goBack();
  await page.waitForURL(new RegExp(`/artifact/${publicId}$`));
  await expect(body.getByText("First draft.")).toBeVisible();
  // Still an editor: what is typed is saved.
  await body.getByText("First draft.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" After Back.");
  await expect(body.getByText("First draft. After Back.")).toBeVisible();
  const indicator = page.getByRole("banner").locator("[data-slot=save-indicator]");
  await expect(indicator).not.toHaveText("Saved");
  await expect(indicator).toHaveText("Saved", { timeout: 12_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Artifact content" }).getByText("First draft. After Back.")).toBeVisible();
});

test("should keep the workspace pane's editor working when its editor opens another page and presses Back", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Back pane ${testInfo.project.name}`, content: "First draft.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/app?artifact=${publicId}`);
  const body = page.getByRole("textbox", { name: "Artifact content" });
  await body.getByText("First draft.").click();
  // A link of the app's own, so the router keeps this page for Back.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL(/\/app\/settings/);

  await page.goBack();
  await page.waitForURL(/\/app/);
  await body.getByText("First draft.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" After Back.");
  await expect(body.getByText("First draft. After Back.")).toBeVisible();
  const status = page.locator("[data-slot=save-status]").getByRole("status");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved", { timeout: 12_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Artifact content" }).getByText("First draft. After Back.")).toBeVisible();
});
