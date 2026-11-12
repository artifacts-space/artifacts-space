import { expect, test, type Page } from "@playwright/test";

import { card, highlighted, pointOn, select } from "./support/inline-comments";

/*
 * Inline comments on a Markdown artifact, on the dev fixture
 * (/dev/inline-comments, src/components/dev/inline-comments-fixture.tsx):
 * the real page editor (or the read view with ?as=reader), the real
 * highlights, cards, and Comments list, with the comments kept in memory.
 * A comment is made on words in the text and shows there: the words are
 * highlighted, and its thread opens in a card at them, never in a dialog.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const list = (page: Page) => page.getByRole("region", { name: "Comments" });
/** A modal dialog over the page, as the Comments dialog is. The card at the text is not one. */
const commentsDialog = (page: Page) => page.locator("[data-slot=dialog-content]");

async function openEditor(page: Page, seeded = false) {
  await page.goto(`/dev/inline-comments${seeded ? "?seed=1" : ""}`);
  await expect(editor(page).getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
}

test.describe("in the editor", () => {
  test.skip(({ isMobile }) => isMobile, "the menu over a selection is for a mouse; touch screens get the toolbar");

  test("should start a comment in a card at the selected words, not in a dialog, when Comment is pressed over a selection", async ({ page }) => {
    await openEditor(page);
    await select(editor(page), "single writer");
    await editor(page).focus();
    await select(editor(page), "single writer");
    await page.getByRole("toolbar", { name: "Format text" }).getByRole("button", { name: "Comment" }).click();

    await expect(card(page)).toBeVisible();
    await expect(commentsDialog(page), "no dialog covers the document").toHaveCount(0);
    expect((await highlighted(page)).open, "the words being commented on are marked").toEqual(["single writer"]);
    const words = await pointOn(editor(page), "single writer");
    const box = await card(page).boundingBox();
    expect(box?.y ?? 0, "the card sits just under the words").toBeGreaterThanOrEqual(words.bottom);
    expect((box?.y ?? Infinity) - words.bottom, "the card sits just under the words").toBeLessThanOrEqual(24);

    await card(page).getByRole("textbox", { name: "Write a comment" }).fill("Should Leah be able to write too?");
    await card(page).getByRole("button", { name: "Comment", exact: true }).click();
    await expect(card(page)).toHaveCount(0);
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);

    // The same comment is in the Comments list, with its words.
    await expect(list(page)).toContainText("Should Leah be able to write too?");
    await expect(list(page).locator("[data-slot=comment-anchor]")).toHaveText(/single writer/);
  });

  test("should open the thread at its words, take a reply, and leave the text once resolved", async ({ page }) => {
    await openEditor(page, true);
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);

    const words = await pointOn(editor(page), "single writer");
    await page.mouse.click(words.x, words.y);
    await expect(card(page)).toContainText("Should Leah be able to write too?");
    await expect(card(page)).toContainText("Not yet.");
    expect((await highlighted(page)).open).toEqual(["single writer"]);

    await card(page).getByRole("textbox", { name: "Write a reply" }).fill("Leah writes from next week.");
    await card(page).getByRole("button", { name: "Reply", exact: true }).last().click();
    await expect(card(page)).toContainText("Leah writes from next week.");

    await card(page).getByRole("button", { name: "Resolve" }).click();
    await expect(card(page)).toHaveCount(0);
    await expect.poll(async () => highlighted(page)).toEqual({ marked: [], open: [] });

    // Resolved threads fold away in the list, and Reopen brings the highlight back.
    await list(page).getByRole("button", { name: /^Resolved/ }).click();
    const resolved = list(page).locator("[data-slot=comment-group][data-resolved=true]").filter({ hasText: "Should Leah be able to write too?" });
    await resolved.getByRole("button", { name: "Reopen" }).click();
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
  });

  test("should keep a comment on its words when text around them is edited, and say so when the words themselves are deleted", async ({ page }) => {
    await openEditor(page, true);
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
    const open = list(page).locator("[data-slot=comment-anchor]").filter({ hasText: "single writer" });
    await expect(open).toHaveAttribute("data-anchor-place", "here");
    // A comment whose words were already gone is still in the list, and says why it is not in the text.
    await expect(list(page).locator("[data-slot=comment-anchor]").filter({ hasText: "the double writer" })).toContainText("On text that changed");

    await editor(page).getByText("The Supasync agent is the single writer").click();
    await page.keyboard.press("Home");
    await page.keyboard.type("Since Monday: ");
    await expect.poll(async () => (await highlighted(page)).marked, "still on the same words after typing before them").toEqual(["single writer"]);

    await select(editor(page), "single writer");
    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await highlighted(page)).marked).toEqual([]);
    await expect(open).toHaveAttribute("data-anchor-place", "changed");
    await expect(open).toContainText("On text that changed");
  });

  test("should start a comment on a whole block in a card at the block when Comment is chosen in its menu", async ({ page }) => {
    await openEditor(page);
    const quote = editor(page).locator("blockquote");
    await quote.hover({ position: { x: 8, y: 6 } });
    await page.getByRole("button", { name: "Block actions" }).click();
    await page.locator("[data-slot=block-menu]").getByRole("menuitem", { name: "Comment" }).click();

    await expect(card(page)).toBeVisible();
    await expect(commentsDialog(page), "no dialog covers the document").toHaveCount(0);
    expect((await highlighted(page)).open).toEqual(["A person's lock beats a supplier close."]);
    await card(page).getByRole("textbox", { name: "Write a comment" }).fill("Agreed.");
    await card(page).getByRole("button", { name: "Comment", exact: true }).click();
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["A person's lock beats a supplier close."]);
  });

  test("should go from a comment in the list to its words and open the thread there", async ({ page }) => {
    await openEditor(page, true);
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
    await list(page).getByRole("button", { name: /Show in the text: single writer/ }).click();
    await expect(card(page)).toContainText("Should Leah be able to write too?");
    expect((await highlighted(page)).open).toEqual(["single writer"]);
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
    expect((await highlighted(page)).marked).toEqual(["single writer"]);
  });
});

test.describe("in the read view", () => {
  const article = (page: Page) => page.locator("[data-slot=inline-comment-surface]");

  test("should offer Comment beside selected words and put the new comment on them", async ({ page }) => {
    await page.goto("/dev/inline-comments?as=reader&seed=1");
    await expect(article(page).getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
    await expect.poll(async () => (await highlighted(page)).marked, "comments made by others show on their words").toEqual(["single writer"]);

    await select(article(page), "still on the feed");
    await page.locator("[data-slot=selection-comment]").click();
    await expect(card(page)).toBeVisible();
    await card(page).getByRole("textbox", { name: "Write a comment" }).fill("Until when?");
    await card(page).getByRole("button", { name: "Comment", exact: true }).click();
    await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer", "still on the feed"]);

    const words = await pointOn(article(page), "still on the feed");
    await page.mouse.click(words.x, words.y);
    await expect(card(page)).toContainText("Until when?");
  });
});
