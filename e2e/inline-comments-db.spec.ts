import { expect, test, type Page } from "@playwright/test";

import { card, highlighted, pointOn, select } from "./support/inline-comments";
import { closeInlineCommentsDb, storedComments } from "./support/inline-comments-db";
import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/*
 * Inline comments end to end, on a real artifact: a comment made on words in
 * the browser is stored with those words, is still on them after a reload,
 * and leaves the text once resolved. The fixture checks
 * (inline-comments.spec.ts) cover the rest of the behaviour without a
 * database; these need a local throwaway Postgres (E2E_LOCAL_DB=1) and skip
 * without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.skip(({ isMobile }) => isMobile, "the menu over a selection is for a mouse; touch screens get the toolbar");

const created: string[] = [];

test.afterAll(async () => {
  await closeInlineCommentsDb();
  await cleanUp(created, []);
});

const content = "# Moving off the feed\n\nThe Supasync agent is the single writer, so nobody overwrites anybody.\n\nThe Supahost agent sends its text by message.";
const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });

/** Signs in and seeds a private Markdown artifact. Returns its public id. */
async function seed(page: Page, title: string) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content, visibility: "private", theme: null });
  created.push(publicId);
  return publicId;
}

/** Selects words in the editor and starts a comment on them from the menu over the selection. */
async function commentOn(page: Page, words: string, body: string) {
  await editor(page).focus();
  await select(editor(page), words);
  await page.getByRole("toolbar", { name: "Format text" }).getByRole("button", { name: "Comment" }).click();
  await card(page).getByRole("textbox", { name: "Write a comment" }).fill(body);
  await card(page).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(card(page)).toHaveCount(0);
}

test("should store a comment with its words and show it on them after a reload when made on the artifact page", async ({ page }, testInfo) => {
  const publicId = await seed(page, `Inline comments page ${testInfo.project.name} ${String(Date.now())}`);
  await page.goto(`/artifact/${publicId}`);
  await expect(editor(page).getByRole("heading", { name: "Moving off the feed" })).toBeVisible();

  await commentOn(page, "single writer", "Should Leah be able to write too?");
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
  expect(await storedComments(publicId)).toEqual([{ body: "Should Leah be able to write too?", quote: "single writer", reply: false, resolved: false }]);

  await page.reload();
  await expect.poll(async () => (await highlighted(page)).marked, "the comment is on its words after a reload").toEqual(["single writer"]);

  // The thread opens at the words, takes a reply, and resolving it takes the highlight away for good.
  const words = await pointOn(editor(page), "single writer");
  await page.mouse.click(words.x, words.y);
  await expect(card(page)).toContainText("Should Leah be able to write too?");
  await card(page).getByRole("textbox", { name: "Write a reply" }).fill("From next week.");
  await card(page).getByRole("button", { name: "Reply", exact: true }).last().click();
  await expect(card(page)).toContainText("From next week.");
  await card(page).getByRole("button", { name: "Resolve" }).click();
  await expect.poll(async () => highlighted(page)).toEqual({ marked: [], open: [] });
  expect(await storedComments(publicId)).toEqual([
    { body: "Should Leah be able to write too?", quote: "single writer", reply: false, resolved: true },
    { body: "From next week.", quote: null, reply: true, resolved: false },
  ]);

  await page.reload();
  await expect(editor(page).getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
  await expect.poll(async () => highlighted(page)).toEqual({ marked: [], open: [] });
});

test("should show a comment made in the workspace pane on the same words on the artifact page", async ({ page }, testInfo) => {
  const title = `Inline comments pane ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await seed(page, title);
  await page.goto("/app");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(title);
  await expect(editor(page).getByRole("heading", { name: "Moving off the feed" })).toBeVisible();

  await commentOn(page, "by message", "Which message?");
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["by message"]);

  await page.goto(`/artifact/${publicId}`);
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["by message"]);
  const words = await pointOn(editor(page), "by message");
  await page.mouse.click(words.x, words.y);
  await expect(card(page)).toContainText("Which message?");
});
