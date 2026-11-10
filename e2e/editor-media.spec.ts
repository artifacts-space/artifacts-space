import { expect, test, type Locator, type Page } from "@playwright/test";

import { largePhoto } from "./support/photos";

/*
 * Media in the rich Markdown editor, on the dev fixture (/dev/editor?kind=media):
 * uploads stay in the tab, and the Markdown the editor would save shows under
 * it. Images, PDFs, and files go in by paste, drop, or the slash menu, show
 * as media blocks instead of raw Markdown, and save as the dialect's form
 * (src/components/editor/rich/markdown-dialect.md).
 */

/** The first upload in the fixture gets this id; each next one counts up. */
const firstUpload = "00000000-0000-4000-8000-000000000001";

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");

async function openFixture(page: Page) {
  await page.goto("/dev/editor?kind=media");
  await page.waitForLoadState("networkidle");
  await expect(editor(page).getByRole("heading", { name: "Media fixture" })).toBeVisible();
  await expect(editor(page).locator('[data-media-state="ready"]')).toHaveCount(1);
  await expect(editor(page).getByText("This image could not be loaded.")).toBeVisible();
}

/**
 * Puts the cursor at the end of a paragraph of the document, and waits until
 * the editor has seen it: keys sent faster than the browser reports the new
 * selection would land where the cursor was before.
 */
async function cursorAfter(page: Page, text: string) {
  await expect(async () => {
    await editor(page).getByText(text).click();
    await page.keyboard.press("End");
    // The editor reads the cursor from the browser's selectionchange event; let it arrive before the next key.
    const seen = await page.evaluate(() => new Promise<string>((resolve) => {
      requestAnimationFrame(() => { setTimeout(() => { resolve(window.getSelection()?.anchorNode?.textContent ?? ""); }, 0); });
    }));
    expect(seen).toBe(text);
  }).toPass({ timeout: 10_000 });
}

/** A small PNG drawn in the browser, as a screenshot would be. */
async function screenshotPng(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillRect(20, 20, 120, 80);
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/png"); });
    if (!blob) throw new Error("No PNG");
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
}

/** Sends a paste of one file to the document, as the browser does for a copied screenshot. */
async function pasteFile(target: Locator, bytes: number[], name: string, type: string) {
  await target.evaluate((element, file) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { bytes, name, type });
}

/** Drops one file onto a paragraph of the document. */
async function dropFile(page: Page, onto: string, bytes: number[], name: string, type: string) {
  const box = await editor(page).getByText(onto).boundingBox();
  if (!box) throw new Error("No drop target");
  await editor(page).evaluate((element, file) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, clientX: file.x, clientY: file.y, bubbles: true, cancelable: true }));
  }, { bytes, name, type, x: box.x + box.width - 2, y: box.y + box.height / 2 });
}

test("should show embedded uploads as media blocks, never as raw Markdown, when a document has them", async ({ page }) => {
  await openFixture(page);
  const image = editor(page).getByRole("img", { name: "Dusk over the hills" });
  await expect(image).toBeVisible();
  await expect(editor(page).getByRole("textbox", { name: "Caption" }).first()).toHaveValue("A preset caption");
  await expect(editor(page).getByText("Kept as written")).toHaveCount(0);
  // A file this reader cannot load shows a notice with a way to open it, not a broken image.
  await expect(editor(page).getByText("This image could not be loaded.")).toBeVisible();
  await expect(savedMarkdown(page)).toHaveText(/^# Media fixture/);
});

test("should upload a pasted screenshot and save it as an image block", async ({ page }) => {
  await openFixture(page);
  await cursorAfter(page, "End paragraph.");
  await pasteFile(editor(page), await screenshotPng(page), "Screenshot.png", "image/png");

  await expect(savedMarkdown(page)).toContainText(`End paragraph.\n\n![](/api/files/${firstUpload})`);
  await expect(editor(page).locator(`[data-media-block="image"] img[src^="blob:"]`)).toBeVisible();
});

test("should upload a dropped PDF and show it with the PDF viewer and a download card", async ({ page }) => {
  await openFixture(page);
  const pdf = [...Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n")];
  await dropFile(page, "Intro paragraph.", pdf, "q3-report.pdf", "application/pdf");

  await expect(savedMarkdown(page)).toContainText(`![q3-report.pdf](/api/files/${firstUpload}#pdf)`);
  await expect(editor(page).locator('[data-media-block="pdf"] iframe')).toHaveCount(1);
  await expect(editor(page).getByRole("link", { name: /q3-report\.pdf/ })).toBeVisible();
});

test("should insert an image from the slash menu, upload the picked photo smaller, and keep its caption", async ({ page }) => {
  await openFixture(page);
  await cursorAfter(page, "Intro paragraph.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await expect(page.getByRole("option", { name: /Image/ })).toBeVisible();
  await page.keyboard.press("Enter");

  const picker = editor(page).getByRole("group", { name: "Add an image" });
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: await largePhoto(page) });

  await expect(savedMarkdown(page)).toContainText(`Intro paragraph.\n\n![](/api/files/${firstUpload})`);
  const caption = editor(page).getByRole("textbox", { name: "Caption" }).first();
  await caption.fill("Taken on site");
  await expect(savedMarkdown(page)).toContainText(`![](/api/files/${firstUpload} "Taken on site")`);

  // The photo was redrawn in the browser before upload: at most 2400 px on its longest side.
  const natural = await editor(page).locator(`[data-media-block="image"] img[src^="blob:"]`).evaluate((element: HTMLImageElement) => Math.max(element.naturalWidth, element.naturalHeight));
  expect(natural).toBeLessThanOrEqual(2400);
});

test("should resize an image from its toolbar and write the width into the Markdown", async ({ page }) => {
  await openFixture(page);
  await editor(page).getByRole("img", { name: "Dusk over the hills" }).click();
  const toolbar = editor(page).getByRole("toolbar", { name: "Media options" });
  await toolbar.getByRole("button", { name: "Large" }).click();
  await expect(savedMarkdown(page)).toContainText(`#width=75 "A preset caption")`);

  await toolbar.getByRole("button", { name: "Alt text" }).click();
  await editor(page).getByRole("textbox", { name: "Alt text" }).fill("Hills at dusk");
  await expect(savedMarkdown(page)).toContainText(`![Hills at dusk](/api/files/`);
});

test("should refuse a file type the store does not take and say why", async ({ page }) => {
  await openFixture(page);
  await cursorAfter(page, "End paragraph.");
  await pasteFile(editor(page), [...Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")], "logo.svg", "image/svg+xml");
  await expect(editor(page).getByRole("alert")).toContainText("This file type is not supported");
  await editor(page).getByRole("button", { name: "Remove" }).click();
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await expect(savedMarkdown(page)).not.toContainText("logo.svg");
});
