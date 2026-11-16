import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { closeInlineEditDb, saveAsSomeoneElse, storedText } from "./support/inline-edit-db";
import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/*
 * Someone else saves an artifact while it is open in the /app pane with
 * unsaved typing, and the page's server answer, which hands the pane the
 * artifact in full when it is outside the list, is drawn again with their
 * save. The person's typing stays in the editor, their save stays in the
 * database, and the editor offers the choice as it does for any refused
 * save. Needs a local throwaway Postgres (E2E_LOCAL_DB=1); skipped without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await closeInlineEditDb();
  await cleanUp(created, []);
});

const savedWithin = { timeout: 12_000 };
const content = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const saveStatus = (page: Page) => page.locator("[data-slot=save-status]").getByRole("status");

/** Types at the end of the line that holds `line`. */
async function typeAfter(page: Page, line: string, text: string) {
  await content(page).getByText(line).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

/** A router refresh, as after any save that revalidates /app, through the router's debugging handle. Waits for its answer. */
async function refreshPage(page: Page) {
  const answered = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(request.url()).pathname === "/app" && request.headers().rsc === "1" && request.headers()["next-router-prefetch"] === undefined && request.headers()["next-action"] === undefined;
  });
  await page.evaluate(() => {
    const next = (window as unknown as { next?: { router?: { refresh: () => void } } }).next;
    if (!next?.router) throw new Error("The router's debugging handle is missing.");
    next.router.refresh();
  });
  await answered;
}

test("should keep the person's typing and offer their version when someone else saves the open artifact and the page is drawn again", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const title = `Pane external save ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content: "# Notes\n\nShared line.", visibility: "private", theme: null });
  created.push(publicId);

  // A tag nothing carries keeps the artifact out of the list, so the server hands it to the pane in full with every answer.
  await page.goto(`/app?tag=nothing-carries-this-${String(Date.now())}&artifact=${publicId}`);
  await expect(page.getByRole("region", { name: `Edit ${title}` })).toBeVisible();
  await typeAfter(page, "Shared line.", " Mine.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);

  await saveAsSomeoneElse(publicId, { content: "# Notes\n\nTheirs instead." });
  await typeAfter(page, "Mine.", " Still mine.");
  await refreshPage(page);

  await expect(page.getByText(/saved a newer version while you were editing/)).toBeVisible(savedWithin);
  await expect(content(page)).toContainText("Shared line. Mine. Still mine.");
  expect((await storedText(publicId)).content, "their save is untouched").toBe("# Notes\n\nTheirs instead.");

  await page.getByRole("button", { name: "Load their version" }).click();
  await expect(content(page)).toContainText("Theirs instead.");
});
