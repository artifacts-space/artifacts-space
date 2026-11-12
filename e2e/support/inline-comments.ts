import type { Locator, Page } from "@playwright/test";

/*
 * Page helpers for the inline comment checks: what the highlights cover,
 * selecting words, and where words are on screen. Shared by the fixture
 * checks (inline-comments.spec.ts) and the database ones
 * (inline-comments-db.spec.ts).
 */

/** The card a thread or a new comment opens in, at its words. */
export const card = (page: Page) => page.locator("[data-slot=inline-comment-card]");

/** The text each highlight covers: every open inline comment's words, and the open thread's. */
export function highlighted(page: Page) {
  return page.evaluate(() => {
    const words = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((range) => (range as Range).toString().replace(/\s+/g, " "));
    return { marked: words("inline-comment"), open: words("inline-comment-active") };
  });
}

/** Selects `words` inside `scope` with the mouse's result: a selection over exactly those words. */
export async function select(scope: Locator, words: string) {
  await scope.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(text);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`"${text}" is not in one text node`);
  }, words);
}

/** The middle of the first line box of `words` in `scope`, to click on the words themselves. */
export function pointOn(scope: Locator, words: string) {
  return scope.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(text);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const box = range.getClientRects().item(0);
      if (!box) break;
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, bottom: box.bottom, left: box.left };
    }
    throw new Error(`"${text}" is not on the page`);
  }, words);
}
