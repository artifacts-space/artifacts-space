import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/**
 * @mentions in a document's own text, on the /dev/editor fixture with three
 * in-memory teammates (`?mentions=1`; no database): typing "@" lists who can
 * be mentioned, a pick writes plain "@handle" text with a chip on it, and
 * the keyboard does everything the pointer does. The server side (who is
 * told, and when) is in src/lib/comments/document-mentions.db.test.ts.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const suggestions = (page: Page) => page.getByRole("listbox", { name: "Mention suggestions" });

/**
 * Opens the fixture and puts the caret at the end of its first paragraph.
 * The caret is set through the selection, not with End: End goes to the end
 * of the line the click landed on, which depends on where the text wraps.
 */
async function openAtFirstParagraph(page: Page, query = "&mentions=1") {
  await page.goto(`/dev/editor?kind=markdown${query}`);
  const paragraph = editor(page).getByText("A paragraph that runs long enough").first();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

test("should list the people and agents to mention when @ is typed, and narrow the list as letters follow", async ({ page }) => {
  await openAtFirstParagraph(page);
  await page.keyboard.type(" @");

  await expect(suggestions(page).getByRole("option")).toHaveText([/@claude-code.*Agent/, /@dana.*Dana Reyes/, /@leah.*Leah Park/]);
  await expectNoAxeViolations(page);

  await page.keyboard.type("da");
  await expect(suggestions(page).getByRole("option")).toHaveText([/@dana/]);
});

test("should write the handle as text with a chip on it when a suggestion is picked with the keyboard", async ({ page }) => {
  await openAtFirstParagraph(page);
  await page.keyboard.type(" @cl");
  await expect(suggestions(page).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");

  await expect(suggestions(page)).toHaveCount(0);
  const chip = editor(page).locator("[data-mention=claude-code]");
  await expect(chip).toHaveText("@claude-code");
  // Typing goes on after the handle, in the same paragraph.
  await page.keyboard.type("please tighten this.");
  await expect(editor(page).getByText("@claude-code please tighten this.")).toBeVisible();
});

test("should write the handle when a suggestion is clicked, and keep the caret in the document", async ({ page }) => {
  await openAtFirstParagraph(page);
  await page.keyboard.type(" @");
  await suggestions(page).getByRole("option", { name: /@leah/ }).click();

  await expect(editor(page).locator("[data-mention=leah]")).toHaveText("@leah");
  await expect(editor(page)).toBeFocused();
});

test("should close the list on Escape and leave what was typed as plain text", async ({ page }) => {
  await openAtFirstParagraph(page);
  await page.keyboard.type(" @zz");
  await expect(page.getByText("No match. You can mention this artifact's author and your teammates.")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByText("No match.")).toHaveCount(0);
  await expect(editor(page).locator("[data-mention]")).toHaveCount(0);
  await expect(editor(page).getByText("@zz")).toBeVisible();
});

test("should show the list under an @ already being typed as soon as the people to mention arrive", async ({ page }) => {
  await openAtFirstParagraph(page, "&mentions=late");
  await page.keyboard.type(" @da");
  await expect(page.getByText("No one to mention here yet. You can mention this artifact's author and your teammates.")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("fixture:mentions-arrive")));

  // No further key: the list replaces the hint, and Enter picks from it.
  await expect(suggestions(page).getByRole("option")).toHaveText([/@dana/]);
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("[data-mention=dana]")).toHaveText("@dana");
});

test("should say the list could not be loaded, and not that there is nobody to mention, when the load fails, and ask again when the window gets focus", async ({ page }) => {
  await openAtFirstParagraph(page, "&mentions=fail");
  await page.keyboard.type(" @da");

  await expect(page.getByText("The list of people to mention could not be loaded. A handle typed in full still reaches its owner once they can read this artifact.")).toBeVisible();
  await expect(page.getByText("No one to mention here yet.")).toHaveCount(0);

  // The network is back, and coming back to the window asks again: the list shows under the same "@", with no further key.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("fixture:mentions-arrive"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect(suggestions(page).getByRole("option")).toHaveText([/@dana/]);
});

test("should offer no suggestions where the page gives the document nobody to mention", async ({ page }) => {
  await openAtFirstParagraph(page, "");
  await page.keyboard.type(" @da");

  await expect(editor(page).getByText("@da")).toBeVisible();
  await expect(suggestions(page)).toHaveCount(0);
  await expect(page.locator("[data-slot=mention-menu]")).toHaveCount(0);
});
