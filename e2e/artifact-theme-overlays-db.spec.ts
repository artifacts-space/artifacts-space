import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * A themed artifact's own page, against a real database: History, a dialog
 * in a portal outside the themed page, draws with the artifact theme's
 * colors, and leaving for the workspace takes the theme off the body again.
 * artifact-page-share.spec.ts holds the same for a dialog and a toast in CI.
 * Needs dev sign-in and a local throwaway database (support/local-db.ts);
 * skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

const tokenNames = ["--popover", "--popover-foreground", "--border"];

test.setTimeout(30_000);

test("should draw History with the artifact theme's colors, and take the theme off when the reader leaves the page", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Ink page ${testInfo.project.name}`, content: "# Notes", visibility: "private", theme: "ink" });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  await page.getByRole("banner").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: /^History of / });
  await expect(dialog).toBeVisible();
  const tokens = (element: Element, names: string[]) => names.map((name) => getComputedStyle(element).getPropertyValue(name).trim());
  const inDialog = await dialog.evaluate(tokens, tokenNames);
  // By selector: the page behind an open dialog is out of the accessibility tree.
  const onPage = await page.locator("main").first().evaluate(tokens, tokenNames);
  expect(inDialog).toEqual(onPage);
  expect(await page.evaluate(() => document.body.style.getPropertyValue("--popover"))).not.toBe("");

  await page.keyboard.press("Escape");
  await page.getByRole("banner").getByRole("link", { name: "artifacts.space home" }).click();
  await page.waitForURL(/\/app/);
  expect(await page.evaluate(() => document.body.style.getPropertyValue("--popover")), "the workspace keeps the site's colors").toBe("");
});
