import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, devUserId, localDatabaseEnabled, localDatabaseSkipReason, storedThemes } from "./support/local-db";

/**
 * An editor picks a theme on the artifact page: the page renders in it, the
 * artifact stores the preset id, and the save is filed as a version. Needs
 * dev sign-in and a local throwaway database (support/local-db.ts); skipped
 * otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

test("should save and render the theme an editor picks on the artifact page", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await devUserId(), title: `Theme e2e ${testInfo.project.name}`, content: "# Notes\n\nPick a look.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  const scope = page.locator("[data-artifact-theme]");
  await expect(scope).toHaveAttribute("data-artifact-theme", "default");
  await page.getByRole("button", { name: "Choose a theme" }).click();
  await page.getByRole("radio", { name: /^Editorial:/ }).click();

  await expect(scope).toHaveAttribute("data-artifact-theme", "editorial");
  await expect(page.getByRole("heading", { level: 1, name: `Theme e2e ${testInfo.project.name}` })).toHaveCSS("font-family", /^"Instrument Serif"/);
  await expect(page.getByRole("button", { name: /Theme: Editorial/ })).toBeVisible();
  const stored = await storedThemes(publicId);
  expect(stored.artifact).toBe("editorial");
  expect(stored.versions[0]).toBe("editorial");
});
