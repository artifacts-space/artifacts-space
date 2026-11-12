import { expect, test, type Page } from "@playwright/test";

import { listItemsFixtureMarkdown } from "../src/components/dev/list-items-fixture";

/*
 * List items that hold blocks, in the rich Markdown editor, on the dev
 * fixture (/dev/editor?kind=lists): task items with a paragraph, a code
 * block, and another paragraph, written with blank lines as agents write
 * them. They load as formatted blocks, and an edit changes only the part
 * edited in the Markdown the editor would save.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");

/** The saved Markdown, exactly: spaces and blank lines count. */
async function expectSaved(page: Page, markdown: string) {
  await expect.poll(async () => savedMarkdown(page).textContent()).toBe(markdown);
}

/**
 * Puts the cursor at the end of the code block's text, and waits until the
 * editor has seen it: keys sent faster than the browser reports the new
 * selection would land where the cursor was before.
 */
async function cursorAtEndOfCode(page: Page, text: string) {
  const code = editor(page).locator("pre code", { hasText: text });
  await code.click();
  await code.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await expect.poll(() => page.evaluate((end) => new Promise<boolean>((resolve) => {
    requestAnimationFrame(() => { setTimeout(() => { resolve(window.getSelection()?.anchorNode?.textContent?.endsWith(end) === true); }, 0); });
  }), text)).toBe(true);
}

test("should format list items that hold code blocks and save only the parts edited", async ({ page }) => {
  await page.goto("/dev/editor?kind=lists");
  await page.waitForLoadState("networkidle");
  await expect(editor(page).getByRole("heading", { name: "Record" })).toBeVisible();

  // Nothing is kept as written: no notice over the editor and no source box.
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(editor(page).getByText("Kept as written")).toHaveCount(0);
  await expect(editor(page).locator("pre code", { hasText: "pnpm install" })).toBeVisible();

  const item = editor(page).getByRole("listitem").filter({ hasText: "2. Save a new artifact" });
  await expect(item.locator("pre code", { hasText: "Save this as an artifact" })).toBeVisible();

  // Ticking the box changes one character.
  await editor(page).getByRole("checkbox", { name: /^Task item checkbox for 2\. Save a new artifact/ }).click();
  const ticked = listItemsFixtureMarkdown.replace("- [ ] **2. Save", "- [x] **2. Save");
  await expectSaved(page, ticked);

  // Editing the code changes only the code line.
  await cursorAtEndOfCode(page, "Save this as an artifact in my Launch project.");
  await page.keyboard.type(" Now.");
  await expectSaved(page, ticked.replace("my Launch project.\n", "my Launch project. Now.\n"));
});
