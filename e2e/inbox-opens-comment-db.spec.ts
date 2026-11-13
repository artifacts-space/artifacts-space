import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeInboxDb, insertComment, mention, mentionRead, resolveThread, softDeleteComment } from "./support/inbox-db";
import { card, highlighted } from "./support/inline-comments";
import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/*
 * Choosing a mention in the Inbox opens the artifact itself, with that
 * comment in view: an inline comment in its card at the words, a comment on
 * the whole artifact (or a reply) in the Comments list. Old links to the
 * retired thread page land in the same place. These need a local throwaway
 * Postgres (E2E_LOCAL_DB=1) and skip without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const people: string[] = [];

test.afterAll(async () => {
  await closeInboxDb();
  await cleanUp(created, people);
});

const content = "# Moving off the feed\n\nThe Supasync agent is the single writer, so nobody overwrites anybody.\n\nThe Supahost agent sends its text by message.";
const words = { quote: "single writer", prefix: "The Supasync agent is the ", suffix: ", so nobody overwrites anybody." };

interface Seeded {
  publicId: string;
  title: string;
  viewer: string;
  inline: string;
  inlineReply: string;
  thread: string;
  threadReply: string;
}

/**
 * Signs in as the dev user and seeds their Markdown artifact with comments
 * from someone else that mention them: an inline comment and a reply to it,
 * then enough comments on the whole artifact that the last thread starts
 * below the Comments dialog's fold, and a reply to it.
 */
async function seed(page: Page, name: string): Promise<Seeded> {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const viewer = await readyDevUser();
  const author = await createTestUser();
  people.push(author);
  const title = `Inbox ${name} ${String(Date.now())}`;
  const publicId = await createTestArtifact({ userId: viewer, title, content, visibility: "private", theme: null });
  created.push(publicId);
  const inline = await insertComment({ publicId, authorId: author, body: "Is this still true?", seconds: 600, quote: words });
  const inlineReply = await insertComment({ publicId, authorId: author, parentId: inline, body: "Asking again about the writer.", seconds: 590 });
  for (let index = 0; index < 12; index += 1) {
    await insertComment({ publicId, authorId: author, body: `Earlier note ${String(index)}. ${"Some context for the move. ".repeat(12)}`, seconds: 500 - index });
  }
  const thread = await insertComment({ publicId, authorId: author, body: "Whole-artifact question for you.", seconds: 300 });
  const threadReply = await insertComment({ publicId, authorId: author, parentId: thread, body: "Follow-up on the whole artifact.", seconds: 200 });
  for (const id of [inline, inlineReply, thread, threadReply]) await mention(id, viewer);
  return { publicId, title, viewer, inline, inlineReply, thread, threadReply };
}

/** The Inbox row for a mention, found by its artifact's title and its comment's text. */
function inboxRow(page: Page, title: string, text: string): Locator {
  return page.locator("[data-slot=inbox-entry]").filter({ hasText: title }).filter({ hasText: text });
}

/** Opens the Inbox and chooses the row for a mention. */
async function chooseInInbox(page: Page, seeded: Seeded, text: string, commentId: string) {
  await page.goto("/inbox");
  const row = inboxRow(page, seeded.title, text);
  // The row is a real link: it opens in a new tab with a middle-click, and names the comment.
  await expect(row.getByRole("link", { name: seeded.title })).toHaveAttribute("href", `/app?artifact=${seeded.publicId}&comment=${commentId}`);
  await row.click();
  // The link is acted on once and leaves the address bar.
  await expect(page).toHaveURL(/\/app$/);
}

/** The Comments dialog. The card at the words is a dialog too (a popover), so it is told apart by its heading. */
const dialog = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Comments on / }) });

/**
 * From the next page load on, records whether the Comments dialog ever
 * showed in that page, even for a moment (the card at the words is not it).
 */
async function watchForCommentsDialog(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { commentsDialogSeen?: boolean };
    new MutationObserver(() => {
      if (document.querySelector("[data-slot=dialog-content]")) record.commentsDialogSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
}

function commentsDialogSeen(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { commentsDialogSeen?: boolean }).commentsDialogSeen === true);
}

/** The linked comment is marked, in view, and has focus. */
async function expectLinked(comment: Locator) {
  await expect(comment).toHaveAttribute("data-linked-comment", "");
  await expect(comment).toBeInViewport();
  await expect(comment).toBeFocused();
}

test("should open an inline comment in its card at the words when it is chosen in the Inbox", async ({ page }, testInfo) => {
  const seeded = await seed(page, `inline ${testInfo.project.name}`);
  await watchForCommentsDialog(page);
  await chooseInInbox(page, seeded, "Is this still true?", seeded.inline);

  await expect(card(page)).toContainText("Is this still true?");
  await expectLinked(card(page).locator(`#comment-${seeded.inline}`));
  await expect.poll(async () => (await highlighted(page)).open, "the words are marked as the open thread's").toEqual(["single writer"]);
  expect(await commentsDialogSeen(page), "the Comments dialog never opened on the way").toBe(false);
  await expect.poll(() => mentionRead(seeded.inline, seeded.viewer), "choosing it marks it read").toBe(true);
});

test("should open a reply on an inline comment in the thread's card with the reply in view", async ({ page }, testInfo) => {
  const seeded = await seed(page, `inline reply ${testInfo.project.name}`);
  await chooseInInbox(page, seeded, "Asking again about the writer.", seeded.inlineReply);

  await expect(card(page)).toContainText("Is this still true?");
  await expectLinked(card(page).locator(`#comment-${seeded.inlineReply}`));
});

test("should open the Comments list at a comment on the whole artifact when it is chosen in the Inbox", async ({ page }, testInfo) => {
  const seeded = await seed(page, `thread ${testInfo.project.name}`);
  await chooseInInbox(page, seeded, "Whole-artifact question for you.", seeded.thread);

  await expect(dialog(page).getByRole("heading", { name: `Comments on ${seeded.title}` })).toBeVisible();
  await expectLinked(dialog(page).locator(`#comment-${seeded.thread}`));
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => mentionRead(seeded.thread, seeded.viewer), "choosing it marks it read").toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("should open the Comments list at a reply when the reply is chosen in the Inbox", async ({ page }, testInfo) => {
  const seeded = await seed(page, `thread reply ${testInfo.project.name}`);
  await chooseInInbox(page, seeded, "Follow-up on the whole artifact.", seeded.threadReply);

  await expectLinked(dialog(page).locator(`#comment-${seeded.threadReply}`));
});

test("should send an old thread link to the artifact at its comment when the link was sent before", async ({ page }, testInfo) => {
  const seeded = await seed(page, `old link ${testInfo.project.name}`);
  await watchForCommentsDialog(page);

  await page.goto(`/threads/${seeded.publicId}#comment-${seeded.thread}`);
  await expect(page).toHaveURL(/\/app$/);
  await expectLinked(dialog(page).locator(`#comment-${seeded.thread}`));

  await page.goto(`/threads/${seeded.publicId}#comment-${seeded.inline}`);
  await expect(page).toHaveURL(/\/app$/);
  await expect(card(page)).toContainText("Is this still true?");
  await expectLinked(card(page).locator(`#comment-${seeded.inline}`));
  expect(await commentsDialogSeen(page), "an old link to a comment on words never opens the Comments dialog first").toBe(false);

  // A link without a comment still opens the artifact's comments.
  await page.goto(`/threads/${seeded.publicId}`);
  await expect(dialog(page).getByRole("heading", { name: `Comments on ${seeded.title}` })).toBeVisible();
});

test("should open the Comments list at a resolved thread, and say so quietly when the comment was deleted", async ({ page }, testInfo) => {
  const seeded = await seed(page, `gone ${testInfo.project.name}`);
  await resolveThread(seeded.inline, seeded.viewer);
  await softDeleteComment(seeded.thread);

  await page.goto(`/app?artifact=${seeded.publicId}&comment=${seeded.inline}`);
  await expect(dialog(page).getByRole("button", { name: /Resolved/ })).toHaveAttribute("aria-expanded", "true");
  await expectLinked(dialog(page).locator(`#comment-${seeded.inline}`));
  await expect(card(page)).toHaveCount(0);

  await page.goto(`/app?artifact=${seeded.publicId}&comment=${seeded.thread}`);
  await expect(dialog(page).getByRole("status").filter({ hasText: "This comment was deleted." })).toBeFocused();
});
