import type { Locator, Page } from "@playwright/test";

import { expect } from "./test";

/**
 * Helpers for the specs about files on /dev/workspace: its stand-in keeps
 * new artifacts and their uploads in the tab's sessionStorage and acts as
 * the server does (fixture-new-artifacts.ts, fixture-media.ts).
 */

/** An artifact the stand-in stored in this tab. */
export interface StoredArtifact { title: string; kind: string; content: string; files: { id: string; filename: string }[] }

/** The artifacts the stand-in stored in this tab, newest first. */
export const storedNew = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as StoredArtifact[]);
/** The row of an artifact in the list, by its title. */
export const cards = (page: Page, title: string) => page.locator("[data-slot=artifact-list] li").filter({ has: page.getByText(title, { exact: true }) });
/** The artifact's content, in the editor pane. */
export const body = (page: Page) => page.getByRole("region", { name: "Content" });
/** The document's editable text. */
export const documentOf = (page: Page) => body(page).locator('.rich-editor-content[contenteditable="true"]');
/** The document's file blocks. */
export const media = (page: Page) => documentOf(page).locator("[data-media-block]");

/** Opens the workspace with nothing stored in the tab, on a blank new page. */
export async function openNewArtifact(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(page.getByRole("region", { name: "New artifact" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(documentOf(page)).toBeVisible();
}

/** A new document with a title and these paragraphs, stored. */
export async function writeDocument(page: Page, title: string, paragraphs: readonly string[]) {
  await openNewArtifact(page);
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(documentOf(page)).toBeFocused();
  for (const [index, text] of paragraphs.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(text);
  }
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain(paragraphs.at(-1) ?? "");
}

/** A file to carry in a drag or a paste: a small PDF by default, `size` bytes of zeros, or the `bytes` given. */
export interface CarriedFile { name: string; type: string; size?: number; bytes?: number[] }

/** What the page did with a drag event. */
export interface DragOutcome { prevented: boolean }

/**
 * Sends one drag event carrying files to whatever is at a point of the
 * window, as the browser does for files held or dropped there. Answers
 * whether the page took it: a drop the page does not take opens the file
 * instead.
 */
export async function dragFilesAt(page: Page, type: "dragover" | "drop" | "dragleave", files: readonly CarriedFile[], point: { x: number; y: number }): Promise<DragOutcome> {
  return page.evaluate(({ type, files, point }) => {
    const data = new DataTransfer();
    const contents = (file: CarriedFile) => (file.bytes ? new Uint8Array(file.bytes) : file.size === undefined ? "%PDF-1.4" : new Uint8Array(file.size));
    for (const file of files) data.items.add(new File([contents(file)], file.name, { type: file.type }));
    const target = document.elementFromPoint(point.x, point.y) ?? document.body;
    const event = new DragEvent(type, { dataTransfer: data, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return { prevented: event.defaultPrevented };
  }, { type, files: [...files], point });
}

/** Pastes files into the element that has the focus, as a copied file or screenshot is pasted. */
export async function pasteFiles(target: Locator, files: readonly CarriedFile[]) {
  await target.evaluate((element, carried) => {
    const data = new DataTransfer();
    for (const file of carried) data.items.add(new File([file.size === undefined ? "%PDF-1.4" : new Uint8Array(file.size)], file.name, { type: file.type }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...files]);
}

/** A point inside an element, `fromTop` pixels under its top edge. */
export async function pointIn(locator: Locator, fromTop = 8): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Not on the page.");
  return { x: box.x + Math.min(40, box.width / 2), y: box.y + fromTop };
}

/** A document's blocks in order: each paragraph's words, or the kind of a file block. */
export async function outline(page: Page): Promise<string[]> {
  return documentOf(page).locator(":scope > *").evaluateAll((elements) => elements.map((element) => {
    const mediaBlock = element.matches("[data-media-block]") ? element : element.querySelector("[data-media-block]");
    return mediaBlock ? `<${mediaBlock.getAttribute("data-media-block") ?? ""}>` : element.textContent.trim();
  }).filter((entry) => entry !== ""));
}
