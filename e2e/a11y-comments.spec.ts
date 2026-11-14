import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { card, highlighted, pointOn } from "./support/inline-comments";

/*
 * Accessibility of comments, on the inline comments fixture
 * (/dev/inline-comments, the real thread and cards kept in memory): axe on
 * the comment box with its @mention list open, and on a thread opened in its
 * card at the words, in the editor and in the read view.
 */

const list = (page: Page) => page.getByRole("region", { name: "Comments" });
const newComment = (page: Page) => list(page).getByRole("textbox", { name: "Write a comment" });
const mentions = (page: Page) => page.getByRole("listbox", { name: "Mention suggestions" });

async function openThread(page: Page, query: string) {
  await page.goto(`/dev/inline-comments${query}`);
  await expect(page.getByRole("heading", { name: "Moving off the feed" }).first()).toBeVisible();
}

/** Types "Thanks @" in the new comment box, so the mention list opens with every teammate. */
async function openMentions(page: Page) {
  await openThread(page, "?seed=1");
  await list(page).scrollIntoViewIfNeeded();
  await expect(newComment(page)).toHaveAttribute("contenteditable", "true");
  await newComment(page).click();
  await page.keyboard.type("Thanks @");
  await expect(mentions(page).getByRole("option")).toHaveCount(3);
}

/** Clicks the commented words, "single writer", and waits for the thread's card. */
async function openCard(page: Page, scope: Parameters<typeof pointOn>[0]) {
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
  // Clicked again if the first click landed before the page could open the thread.
  await expect(async () => {
    const words = await pointOn(scope, "single writer");
    await page.mouse.click(words.x, words.y);
    await expect(card(page)).toContainText("Should Leah be able to write too?", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test("should pass axe on the comment box with the mention list open and a teammate highlighted", async ({ page }) => {
  await openMentions(page);
  await page.keyboard.press("ArrowDown");
  await expect(mentions(page).getByRole("option", { selected: true })).toContainText("@dana");
  await expectNoAxeViolations(list(page).or(mentions(page)));
});

test("should pass axe on the comment box with the mention list showing no match", async ({ page }) => {
  await openMentions(page);
  await page.keyboard.type("zz");
  await expect(mentions(page)).toHaveCount(0);
  await expectNoAxeViolations(list(page));
});

test("should give the mention list a listbox tree with the highlighted teammate selected", async ({ page }) => {
  await openMentions(page);
  await page.keyboard.press("ArrowDown");
  await expect(mentions(page)).toMatchAriaSnapshot(`
    - listbox "Mention suggestions":
      - option "@claude-code Claude Code Agent"
      - option "@dana Dana Reyes" [selected]
      - option "@leah Leah Park"
  `);
});

test("should pass axe with a thread open in its card in the editor", async ({ page, isMobile }) => {
  test.skip(isMobile, "The editor's cards open from the menu over a selection, which is for a mouse; phones are covered in the read view.");
  await openThread(page, "?seed=1");
  await openCard(page, page.getByRole("textbox", { name: "Artifact content" }));
  await expectNoAxeViolations(card(page));
});

test("should pass axe with a thread open in its card in the read view", async ({ page }) => {
  await openThread(page, "?as=reader&seed=1");
  await openCard(page, page.locator("[data-slot=inline-comment-surface]"));
  await expectNoAxeViolations(page);
});
