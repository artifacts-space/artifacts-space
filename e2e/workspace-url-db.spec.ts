import type { Page, Request } from "@playwright/test";
import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/*
 * The /app address bar on the real workspace: a pick names the artifact
 * without asking the server for the page again, a delete goes back to plain
 * /app in place of the deleted artifact's entry, and Back to a deleted
 * artifact says it is no longer available. These need a local throwaway
 * Postgres (E2E_LOCAL_DB=1) and skip without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

const list = (page: Page) => page.locator('[data-slot="artifact-list"]');
const card = (page: Page, title: string) => list(page).getByRole("button", { name: new RegExp(`^${title}`) });
const selectedCard = (page: Page) => list(page).locator('[aria-current="true"]');
const editor = (page: Page, title: string) => page.getByRole("region", { name: `Edit ${title}` });
const historyLength = (page: Page) => page.evaluate(() => window.history.length);
const urlOf = (publicId: string) => new RegExp(`/app\\?artifact=${publicId}$`);

/**
 * A request for the /app page itself (an RSC navigation or refresh, or a document load), not a prefetch. Server
 * actions post to the page's URL too (opening an artifact loads its content with one, as before); they are not
 * the page.
 */
function isPageRequest(request: Request): boolean {
  const headers = request.headers();
  return new URL(request.url()).pathname === "/app" && headers["next-router-prefetch"] === undefined && headers["next-action"] === undefined;
}

/** Picks an artifact in the list once the workspace is interactive. */
async function pick(page: Page, title: string) {
  await expect(async () => {
    await card(page, title).click();
    await expect(selectedCard(page)).toContainText(title, { timeout: 1000 });
  }).toPass();
}

/** Signs in as the dev user and seeds two private Markdown artifacts. */
async function seed(page: Page, name: string) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const userId = await readyDevUser();
  const stamp = String(Date.now());
  const first = { title: `Address first ${name} ${stamp}`, publicId: "" };
  const second = { title: `Address second ${name} ${stamp}`, publicId: "" };
  first.publicId = await createTestArtifact({ userId, title: first.title, content: "# First\n\nOne.", visibility: "private", theme: null });
  second.publicId = await createTestArtifact({ userId, title: second.title, content: "# Second\n\nTwo.", visibility: "private", theme: null });
  created.push(first.publicId, second.publicId);
  return { first, second };
}

test("should name picks without a page request, go back to plain /app after a delete, and say a deleted artifact is gone on Back", async ({ page }, testInfo) => {
  const { first, second } = await seed(page, testInfo.project.name);
  await page.goto(`/app?artifact=${first.publicId}`);
  await expect(editor(page, first.title)).toBeVisible();
  const start = await historyLength(page);

  const requests: string[] = [];
  page.on("request", (request) => { if (isPageRequest(request)) requests.push(`${request.method()} ${request.url()}`); });
  await pick(page, second.title);
  await expect(page).toHaveURL(urlOf(second.publicId));
  await expect(editor(page, second.title)).toBeVisible();
  await pick(page, first.title);
  await expect(page).toHaveURL(urlOf(first.publicId));
  await expect(editor(page, first.title)).toBeVisible();
  expect(requests, "a pick never asks the server for the page").toEqual([]);
  expect(await historyLength(page)).toBe(start + 2);

  await editor(page, first.title).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete artifact" }).click();
  await page.getByRole("dialog", { name: "Delete this artifact?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card(page, first.title)).toHaveCount(0);
  await expect(page, "the deleted artifact's entry becomes plain /app").toHaveURL(/\/app$/);
  expect(await historyLength(page), "a delete adds no entry").toBe(start + 2);

  await page.goBack();
  await expect(page).toHaveURL(urlOf(second.publicId));
  await expect(editor(page, second.title)).toBeVisible();

  // The first entry names the deleted artifact: the notice shows, and the address names what stays open.
  await page.goBack();
  await expect(page.getByText("This artifact is no longer available.")).toBeVisible();
  await expect(editor(page, second.title)).toBeVisible();
  await expect(page).toHaveURL(urlOf(second.publicId));
});

test("should open the same artifact after a reload when the address names it", async ({ page }, testInfo) => {
  const { first, second } = await seed(page, `reload ${testInfo.project.name}`);
  await page.goto(`/app?artifact=${first.publicId}`);
  await pick(page, second.title);
  await expect(page).toHaveURL(urlOf(second.publicId));
  await page.reload();
  await expect(editor(page, second.title)).toBeVisible();
  await expect(selectedCard(page)).toContainText(second.title);
});
