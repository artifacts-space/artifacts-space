import { expect, test, type Locator, type Page } from "@playwright/test";

import { listItemsFixtureMarkdown } from "../src/components/dev/list-items-fixture";

/*
 * List items that hold blocks, in the rich Markdown editor, on the dev
 * fixture (/dev/editor?kind=lists): task items with a paragraph, a code
 * block, and another paragraph, written with blank lines as agents write
 * them, and numbered steps. They load as formatted blocks, and an edit
 * changes only the part edited in the Markdown the editor would save.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");

/** The saved Markdown, exactly: spaces and blank lines count. */
async function expectSaved(page: Page, markdown: string) {
  await expect.poll(async () => savedMarkdown(page).textContent()).toBe(markdown);
}

/**
 * Puts the cursor at the end of the element's text, and waits until the
 * editor has seen it: keys sent faster than the browser reports the new
 * selection would land where the cursor was before.
 */
async function cursorAtEnd(page: Page, target: Locator, text: string) {
  await target.click();
  await target.evaluate((element) => {
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

  // Steps set apart by blank lines are one task list, not one list per step.
  await expect(editor(page).locator('ul[data-type="taskList"]')).toHaveCount(1);
  await expect(editor(page).locator('ul[data-type="taskList"] > li')).toHaveCount(3);

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
  const codeText = "Save this as an artifact in my Launch project.";
  await cursorAtEnd(page, editor(page).locator("pre code", { hasText: codeText }), codeText);
  await page.keyboard.type(" Now.");
  await expectSaved(page, ticked.replace("my Launch project.\n", "my Launch project. Now.\n"));
});

test("should format numbered items and number the list again when an item is added", async ({ page }) => {
  await page.goto("/dev/editor?kind=lists");
  await page.waitForLoadState("networkidle");

  // Bold text in a numbered item shows as bold, never as stars.
  const shipped = editor(page).getByRole("listitem").filter({ hasText: "Ship it." });
  await expect(shipped.locator("strong")).toHaveText("Ship");
  await expect(editor(page).getByText("**Ship**")).toHaveCount(0);
  await expect(page.getByRole("note")).toHaveCount(0);

  // A new step after step 2 takes number 3, and the step after it becomes 4. Nothing else changes.
  await cursorAtEnd(page, editor(page).locator("li p", { hasText: "Run it." }), "Run it.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Check.");
  const added = listItemsFixtureMarkdown.replace("2. Run it.\n3. **Ship** it.\n", "2. Run it.\n3. Check.\n4. **Ship** it.\n");
  await expectSaved(page, added);

  // A space typed at the end of another item changes that item only: the step added before stays.
  await cursorAtEnd(page, editor(page).locator("li p", { hasText: "two" }), "two");
  await page.keyboard.type(" ");
  await expectSaved(page, added.replace("* two\n", "* two \n"));
  await page.keyboard.type("more");
  await expectSaved(page, added.replace("* two\n", "* two more\n"));
});
