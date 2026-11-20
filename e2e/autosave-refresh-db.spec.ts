import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * What an autosave costs on the artifact page, against a real database and
 * the real save action: while the typing goes on, each save is one request
 * and the server renders no page for it; once the saves go quiet, the page
 * asks the server for itself once (useQuietRefresh), and a reload shows
 * what was typed. Needs dev sign-in and a local throwaway database
 * (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };
const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

/** Counts the requests to `path` from now on: saves (server actions) and renders of the page the browser asks for. */
function watchPage(page: Page, path: string) {
  const seen = { actions: 0, renders: 0 };
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== path) return;
    const headers = request.headers();
    if (request.method() === "POST" && headers["next-action"]) seen.actions += 1;
    if (request.method() === "GET" && headers.rsc) seen.renders += 1;
  });
  return seen;
}

test("should render no page while autosaves follow each other, and ask for the page once when they go quiet", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Autosave cost ${testInfo.project.name}`, content: "First draft.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  const body = page.getByRole("textbox", { name: "Artifact content" });
  const indicator = page.getByRole("banner").locator("[data-slot=save-indicator]");
  await body.getByText("First draft.").click();
  await page.keyboard.press("End");
  const seen = watchPage(page, `/artifact/${publicId}`);

  await page.keyboard.type(" One.");
  await expect(indicator).toHaveText("Saved", savedWithin);
  await page.keyboard.type(" Two.");
  await expect(indicator).not.toHaveText("Saved");
  await expect(indicator).toHaveText("Saved", savedWithin);
  expect(seen.actions, "the saves went to the server").toBeGreaterThanOrEqual(2);
  expect(seen.renders, "no render of the page between or after the saves so far").toBe(0);

  // Quiet: the page catches up with the server once.
  await expect.poll(() => seen.renders, { timeout: 20_000 }).toBe(1);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Artifact content" }).getByText("First draft. One. Two.")).toBeVisible();
  expect(seen.renders, "the reload is a document request, not another render the page asked for").toBe(1);
});

test("should ask the server for the artifact again on Back when the reader left before the page caught up", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Autosave leave ${testInfo.project.name}`, content: "First draft.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/artifact/${publicId}`);
  await page.getByRole("textbox", { name: "Artifact content" }).getByText("First draft.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" One.");
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", savedWithin);

  // Away at once, with the page's refresh still owed: the browser drops the copy it kept from before the save.
  const seen = watchPage(page, `/artifact/${publicId}`);
  await page.getByRole("banner").getByRole("link", { name: "artifacts.space home" }).click();
  await page.waitForURL(/\/app/);
  expect(seen.renders, "leaving asks for the page being opened, not this one").toBe(0);
  await page.goBack();
  await page.waitForURL(new RegExp(`/artifact/${publicId}$`));
  await expect(page.locator("main").first()).toContainText("First draft. One.");
  expect(seen.renders, "Back asked the server for the page").toBeGreaterThanOrEqual(1);
});

test("should render no workspace page while the pane's autosaves follow each other, and ask for it once when they go quiet", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: `Autosave pane ${testInfo.project.name}`, content: "First draft.", visibility: "private", theme: null });
  created.push(publicId);

  await page.goto(`/app?artifact=${publicId}`);
  const body = page.getByRole("textbox", { name: "Artifact content" });
  await body.getByText("First draft.").click();
  await page.keyboard.press("End");
  const indicator = page.locator("[data-slot=save-status]").getByRole("status");
  const seen = watchPage(page, "/app");

  await page.keyboard.type(" One.");
  await expect(indicator).toHaveText("Saved", savedWithin);
  await page.keyboard.type(" Two.");
  await expect(indicator).not.toHaveText("Saved");
  await expect(indicator).toHaveText("Saved", savedWithin);
  expect(seen.actions, "the saves went to the server").toBeGreaterThanOrEqual(2);
  expect(seen.renders, "no render of the workspace between or after the saves so far").toBe(0);
  await expect.poll(() => seen.renders, { timeout: 20_000 }).toBe(1);
});
