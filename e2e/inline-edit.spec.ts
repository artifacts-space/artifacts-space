import { expect, test, type Page } from "@playwright/test";

import { closeInlineEditDb, saveAsSomeoneElse, storedText, versionKinds } from "./support/inline-edit-db";
import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * Inline editing in /app and on the artifact page: an artifact you may edit is unlocked where it
 * reads, saves on its own a moment after typing stops, files one version per
 * editing session, and never overwrites someone else's newer save. Needs dev
 * sign-in and a local throwaway database (support/local-db.ts); skipped
 * otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const created: string[] = [];

test.afterAll(async () => {
  await closeInlineEditDb();
  await cleanUp(created, []);
});

const saveStatus = (page: Page) => page.locator("[data-slot=save-status]").getByRole("status");

/** Signs in, seeds a Markdown artifact, and opens it in /app. Returns its public id. */
async function openSeeded(page: Page, title: string, content: string) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content, visibility: "private", theme: null });
  created.push(publicId);
  await openInApp(page, title);
  return publicId;
}

async function openInApp(page: Page, title: string) {
  await page.goto("/app");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(title);
}

/** Types at the end of a line of the document. */
async function typeAfter(page: Page, line: string, text: string) {
  await page.getByRole("textbox", { name: "Artifact content" }).getByText(line).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("should save a Markdown edit in place, keep it after a reload, and file one version for the session", async ({ page }, testInfo) => {
  const title = `Inline markdown ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Launch notes\n\nFirst line.");
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Editor mode" })).toHaveCount(0);

  await typeAfter(page, "First line.", " Second burst.");
  await expect(saveStatus(page)).toHaveText("Saved");
  await typeAfter(page, "Second burst.", " Third burst.");
  await expect(saveStatus(page)).toHaveText("Saved");

  await page.reload();
  await openInApp(page, title);
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("First line. Second burst. Third burst.");
  // The artifact as it was seeded, then one version for the whole editing session.
  expect(await versionKinds(publicId)).toEqual(["snapshot", "edit"]);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
});

test("should merge someone else's newer save when it changed a different field", async ({ page }, testInfo) => {
  const title = `Inline merge ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Notes\n\nMine starts here.");
  await typeAfter(page, "Mine starts here.", " One.");
  await expect(saveStatus(page)).toHaveText("Saved");

  await saveAsSomeoneElse(publicId, { title: `${title} (renamed)` });
  await typeAfter(page, "One.", " Two.");
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(`${title} (renamed)`);
  expect(await storedText(publicId)).toEqual({ title: `${title} (renamed)`, content: "# Notes\n\nMine starts here. One. Two." });
});

test("should refuse to overwrite someone else's newer content and offer their version", async ({ page }, testInfo) => {
  const title = `Inline conflict ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Notes\n\nShared line.");
  await typeAfter(page, "Shared line.", " Mine.");
  await expect(saveStatus(page)).toHaveText("Saved");

  await saveAsSomeoneElse(publicId, { content: "# Notes\n\nTheirs instead." });
  await typeAfter(page, "Mine.", " Still mine.");
  await expect(page.getByText(/saved a newer version while you were editing/)).toBeVisible();
  expect((await storedText(publicId)).content, "their save is untouched").toBe("# Notes\n\nTheirs instead.");

  await page.getByRole("button", { name: "Load their version" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("Theirs instead.");
  await expect(page.getByText(/saved a newer version while you were editing/)).toHaveCount(0);
});

test("should unlock Markdown in place on the artifact's own page and save it on its own", async ({ page }, testInfo) => {
  const title = `Inline page ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Page notes\n\nRead here.");
  await page.goto(`/artifact/${publicId}`);
  const content = page.getByRole("textbox", { name: "Artifact content" });
  await expect(content).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  const status = page.locator("[data-slot=editor-bar]").getByRole("status");

  await content.getByText("Read here.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited here.");
  await expect(status).toHaveText("Saved");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("Read here. Edited here.");
  expect(await versionKinds(publicId)).toEqual(["snapshot", "edit"]);
});
