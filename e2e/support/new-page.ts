import type { Page } from "@playwright/test";

import { expect } from "./test";

/**
 * Helpers for the New artifact page on /dev/workspace, shared by the specs
 * that need a page of a certain format. A document takes dropped files in
 * its text, so a spec about attached files first makes the page a format
 * that gets them attached: a table, a Text page, or an interface.
 */

/** Picks a format for the page that is open, from the blank page's Format button. */
export async function switchBlankPageTo(page: Page, format: string) {
  await page.getByRole("region", { name: "New artifact" }).getByRole("button", { name: "Format" }).click();
  const dialog = page.getByRole("dialog", { name: "Format and language" });
  await dialog.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: format, exact: true }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
}

/** Pastes rows into the empty body, which makes the page a table (CSV), and waits for its grid. */
export async function pasteTable(page: Page, csv = "name,value\nAda,1\nBo,2") {
  const body = page.getByRole("region", { name: "Content" });
  const field = body.locator('[contenteditable="true"]');
  await expect(field).toBeVisible();
  await field.click();
  await field.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, csv);
  await expect(body.getByRole("grid")).toBeVisible();
}

/** The quiet list of files that are attached and shown nowhere on the page. */
export function attachedList(page: Page) {
  return page.getByRole("region", { name: "Attached files" });
}

/**
 * Makes the blank page a Text page: one that starts empty and is not stored
 * until something is written, and that gets dropped files attached. The
 * create then carries the files that were dropped before it.
 */
export async function blankTextPage(page: Page) {
  await switchBlankPageTo(page, "Text");
  await expect(page.getByRole("region", { name: "Content" }).getByRole("textbox", { name: "Artifact content" })).toBeVisible();
}

/** Writes in a Text page's body, which stores the page (with the files dropped on it so far). */
export async function writeTextBody(page: Page, text: string) {
  await page.getByRole("region", { name: "Content" }).getByRole("textbox", { name: "Artifact content" }).fill(text);
}

/** Waits until every file dropped on a page that is not stored yet has finished uploading, so the create that comes next carries them. */
export async function uploadsReady(page: Page, count: number) {
  await expect(page.getByRole("list", { name: "Uploads" }).getByRole("listitem").filter({ hasText: "Ready" })).toHaveCount(count);
}
