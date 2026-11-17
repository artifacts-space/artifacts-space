import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/**
 * Files in a document go into its text. A file dropped anywhere on a
 * document's page (the title block, the text, the space under it) becomes a
 * block where it was dropped, and so does a pasted or picked one; the page
 * has no section for adding files. A file that is attached and shown
 * nowhere (an agent's files_attach, or one from before) is still listed,
 * quietly, and can be put into the text. Checked on /dev/workspace, whose
 * stand-in keeps the document's uploads in the tab and attaches them on the
 * save that names them, as the server does.
 */

interface Stored { title: string; kind: string; content: string; files: { id: string; filename: string; embedded?: boolean }[] }
const storedNew = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as Stored[]);
const creates = (page: Page) => page.evaluate(() => Number(window.sessionStorage.getItem("fixture:new-artifact-creates") ?? "0"));
const cards = (page: Page, title: string) => page.locator("[data-slot=artifact-list] li").filter({ has: page.getByText(title, { exact: true }) });
const body = (page: Page) => page.getByRole("region", { name: "Content" });
const documentOf = (page: Page) => body(page).locator('.rich-editor-content[contenteditable="true"]');
const media = (page: Page) => documentOf(page).locator("[data-media-block]");
const landingLine = (page: Page) => page.locator("[data-slot=media-landing-line]");
const filesList = (page: Page) => page.getByRole("region", { name: "Attached files" });
const uploadBox = (page: Page) => page.getByText("Drop files here, or");

/** The file the fixture shows a real image for (fixtureAttachedImageId). */
const attachedImageId = "00000000-0000-4000-8000-0000000000a1";

async function openWorkspace(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
}

async function openNewArtifact(page: Page) {
  await openWorkspace(page);
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(page.getByRole("region", { name: "New artifact" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(documentOf(page)).toBeVisible();
}

/** A new document with a title and these paragraphs, stored. */
async function writeDocument(page: Page, title: string, paragraphs: readonly string[]) {
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

/** A small PNG drawn in the browser, as a screenshot would be. */
async function pngBytes(page: Page): Promise<number[]> {
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

interface Carried { name: string; type: string; bytes: number[] }
interface DragOutcome { prevented: boolean; lineTop: number | null }

/**
 * Sends one drag event carrying files to whatever is at a point of the
 * window, as the browser does for files held or dropped there. Answers
 * whether the page took it (a drop the page does not take opens the file
 * instead) and where the landing line is right after, in the same turn.
 */
async function dragFiles(page: Page, type: "dragover" | "drop", files: readonly Carried[], point: { x: number; y: number }): Promise<DragOutcome> {
  return page.evaluate(({ type, files, point }) => {
    const data = new DataTransfer();
    for (const file of files) data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    const target = document.elementFromPoint(point.x, point.y) ?? document.body;
    const event = new DragEvent(type, { dataTransfer: data, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    const line = document.querySelector("[data-slot=media-landing-line]");
    return { prevented: event.defaultPrevented, lineTop: line ? line.getBoundingClientRect().top + line.getBoundingClientRect().height / 2 : null };
  }, { type, files: [...files], point });
}

async function boxOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Not on the page.");
  return box;
}

/** A document's blocks in order: each paragraph's words, or the kind of a media block. */
async function outlineOf(document: Locator): Promise<string[]> {
  return document.locator(":scope > *").evaluateAll((elements) => elements.map((element) => {
    const mediaBlock = element.matches("[data-media-block]") ? element : element.querySelector("[data-media-block]");
    return mediaBlock ? `<${mediaBlock.getAttribute("data-media-block") ?? ""}>` : element.textContent.trim();
  }).filter((entry) => entry !== ""));
}

const outline = (page: Page) => outlineOf(documentOf(page));

/** Every picture in the document has loaded and has pixels. */
async function expectPicturesDrawn(page: Page, count: number) {
  await expect(media(page).locator('[data-media-state="ready"] img')).toHaveCount(count, { timeout: 15_000 });
  const widths = await media(page).locator("img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth));
  expect(widths.every((width) => width > 0), "each picture has pixels").toBe(true);
}

test.describe("dropping files on a document", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop; phones add them by paste and the file picker, below.");

  test("should put a dropped image in the text, between the blocks it was held over, on a new page that has writing", async ({ page }) => {
    await writeDocument(page, "Trip notes", ["First paragraph.", "Second paragraph."]);
    const png = { name: "IMG_6266.png", type: "image/png", bytes: await pngBytes(page) };
    const first = await boxOf(documentOf(page).getByText("First paragraph.", { exact: true }));
    const second = await boxOf(documentOf(page).getByText("Second paragraph.", { exact: true }));
    // Held over the lower half of the first paragraph: one line, between the two paragraphs.
    const point = { x: first.x + 40, y: first.y + first.height - 2 };
    const held = await dragFiles(page, "dragover", [png], point);
    expect(held.prevented, "the page takes the held file").toBe(true);
    expect(held.lineTop, "a line shows where the file will land").not.toBeNull();
    expect(held.lineTop).toBeGreaterThanOrEqual(first.y + first.height - 1);
    expect(held.lineTop).toBeLessThanOrEqual(second.y + 1);
    await expect(page.locator(".prosemirror-dropcursor-block, .prosemirror-dropcursor-inline"), "no text cursor line is drawn for files").toHaveCount(0);
    await expectNoAxeViolations(page.getByRole("region", { name: "Edit Trip notes" }));

    const dropped = await dragFiles(page, "drop", [png], point);
    expect(dropped.prevented, "the page takes the drop, so the browser does not open the file").toBe(true);
    expect(dropped.lineTop, "the line goes with the drop").toBeNull();
    await expectPicturesDrawn(page, 1);
    expect(await outline(page)).toEqual(["First paragraph.", "<image>", "Second paragraph."]);
    await expect(landingLine(page)).toHaveCount(0);

    // Nothing was put in a section under the text, and the save names the file in the text.
    await expect(page.getByRole("region", { name: "Files", exact: true })).toHaveCount(0);
    await expect(filesList(page)).toHaveCount(0);
    await expect(uploadBox(page)).toHaveCount(0);
    await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toMatch(/^First paragraph\.\n\n!\[\]\(\/api\/files\/[0-9a-f-]{36}\)\n\nSecond paragraph\.\n?$/);
    const [stored] = await storedNew(page);
    expect(stored?.kind).toBe("markdown");
    expect(stored?.files.map((file) => file.embedded), "the save attached it as the document's own media").toEqual([true]);
    expect(await creates(page)).toBe(1);

    // A reload shows the same blocks, the picture among them.
    await page.reload();
    await cards(page, "Trip notes").click();
    await expect(documentOf(page).getByText("First paragraph.", { exact: true })).toBeVisible();
    await expectPicturesDrawn(page, 1);
    expect(await outline(page)).toEqual(["First paragraph.", "<image>", "Second paragraph."]);
    await expect(filesList(page), "a file in the text is not listed apart from it").toHaveCount(0);
  });

  test("should take an image dropped on the title block or under the text at the nearest block", async ({ page }) => {
    await writeDocument(page, "Edges", ["Only paragraph."]);
    const png = { name: "Top.png", type: "image/png", bytes: await pngBytes(page) };
    const title = await boxOf(page.getByRole("textbox", { name: "Artifact title" }));
    const onTitle = { x: title.x + 30, y: title.y + title.height / 2 };
    const held = await dragFiles(page, "dragover", [png], onTitle);
    const paragraph = await boxOf(documentOf(page).getByText("Only paragraph.", { exact: true }));
    expect(held.prevented).toBe(true);
    expect(held.lineTop, "the line sits above the first block").toBeLessThan(paragraph.y);
    expect((await dragFiles(page, "drop", [png], onTitle)).prevented).toBe(true);
    await expectPicturesDrawn(page, 1);
    expect(await outline(page)).toEqual(["<image>", "Only paragraph."]);

    // Under the last line, in the page's empty space.
    const text = await boxOf(documentOf(page));
    const under = { x: text.x + 30, y: Math.min(text.y + text.height - 4, (page.viewportSize()?.height ?? 900) - 12) };
    expect((await dragFiles(page, "drop", [{ ...png, name: "Bottom.png" }], under)).prevented).toBe(true);
    await expectPicturesDrawn(page, 2);
    expect(await outline(page)).toEqual(["<image>", "Only paragraph.", "<image>"]);
    await expect(filesList(page)).toHaveCount(0);

    // The picture that ends the document and the line kept under it are one change: one Undo takes both away.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(media(page)).toHaveCount(1);
    expect(await outline(page)).toEqual(["<image>", "Only paragraph."]);
    await expect(documentOf(page).locator(":scope > *")).toHaveCount(2);
  });

  test("should give each of several dropped files its own block, in order", async ({ page }) => {
    await writeDocument(page, "Several", ["Above.", "Below."]);
    const above = await boxOf(documentOf(page).getByText("Above.", { exact: true }));
    const files = [
      { name: "One.png", type: "image/png", bytes: await pngBytes(page) },
      { name: "Two.pdf", type: "application/pdf", bytes: [...Buffer.from("%PDF-1.4")] },
      { name: "Three.zip", type: "application/zip", bytes: [80, 75, 3, 4] },
    ];
    await dragFiles(page, "drop", files, { x: above.x + 40, y: above.y + above.height - 2 });
    await expect(media(page)).toHaveCount(3);
    await expect(media(page).getByRole("group", { name: /^Uploading / }), "every upload finished").toHaveCount(0, { timeout: 15_000 });
    expect(await outline(page)).toEqual(["Above.", "<image>", "<pdf>", "<file>", "Below."]);
    await expect.poll(async () => ((await storedNew(page))[0]?.content.match(/\/api\/files\//g) ?? []).length, { timeout: 15_000 }).toBe(3);
  });

  test("should land above a picture when a file is held over its upper part, and below it over its lower part", async ({ page }) => {
    await writeDocument(page, "Around a picture", ["Above.", "Below."]);
    const above = await boxOf(documentOf(page).getByText("Above.", { exact: true }));
    await dragFiles(page, "drop", [{ name: "One.png", type: "image/png", bytes: await pngBytes(page) }], { x: above.x + 40, y: above.y + above.height - 2 });
    await expectPicturesDrawn(page, 1);
    const pdf = { name: "Two.pdf", type: "application/pdf", bytes: [...Buffer.from("%PDF-1.4")] };
    const zip = { name: "Three.zip", type: "application/zip", bytes: [80, 75, 3, 4] };

    let picture = await boxOf(media(page).first());
    const heldAbove = await dragFiles(page, "dragover", [pdf], { x: picture.x + 40, y: picture.y + 6 });
    expect(heldAbove.lineTop, "the line is above the picture").toBeLessThanOrEqual(picture.y);
    await dragFiles(page, "drop", [pdf], { x: picture.x + 40, y: picture.y + 6 });
    await expect(media(page)).toHaveCount(2);
    expect(await outline(page)).toEqual(["Above.", "<pdf>", "<image>", "Below."]);

    picture = await boxOf(documentOf(page).locator('[data-media-block="image"]'));
    const heldBelow = await dragFiles(page, "dragover", [zip], { x: picture.x + 40, y: picture.y + picture.height - 6 });
    expect(heldBelow.lineTop, "the line is below the picture").toBeGreaterThanOrEqual(picture.y + picture.height);
    await dragFiles(page, "drop", [zip], { x: picture.x + 40, y: picture.y + picture.height - 6 });
    await expect(media(page)).toHaveCount(3);
    expect(await outline(page)).toEqual(["Above.", "<pdf>", "<image>", "<file>", "Below."]);
  });

  test("should put an image dropped on an empty new page into the document, and store the page once", async ({ page }) => {
    await openNewArtifact(page);
    const png = { name: "Screenshot.png", type: "image/png", bytes: await pngBytes(page) };
    const text = await boxOf(documentOf(page));
    expect((await dragFiles(page, "drop", [png], { x: text.x + 60, y: text.y + 40 })).prevented).toBe(true);
    await expectPicturesDrawn(page, 1);
    await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toMatch(/^!\[\]\(\/api\/files\/[0-9a-f-]{36}\)\n?$/);
    const [stored] = await storedNew(page);
    expect(stored?.kind, "the page stays a document").toBe("markdown");
    expect(stored?.files).toHaveLength(1);
    expect(await creates(page)).toBe(1);
    await expect(page.getByRole("region", { name: "Files", exact: true })).toHaveCount(0);
    await expect(filesList(page)).toHaveCount(0);
    // The next file lands in the text too: the page has writing now.
    const picture = await boxOf(media(page).first());
    await dragFiles(page, "drop", [{ ...png, name: "Next.png" }], { x: picture.x + 20, y: picture.y + picture.height - 2 });
    await expectPicturesDrawn(page, 2);
    expect(await creates(page)).toBe(1);
  });

  test("should take a dropped image in a document opened from the list, on its title too", async ({ page }) => {
    await writeDocument(page, "From the list", ["Stored words."]);
    await page.reload();
    await cards(page, "From the list").click();
    await expect(page.getByRole("region", { name: "Edit From the list" })).toBeVisible();
    await expect(documentOf(page).getByText("Stored words.", { exact: true })).toBeVisible();
    const png = { name: "Listed.png", type: "image/png", bytes: await pngBytes(page) };
    const title = await boxOf(page.getByRole("textbox", { name: "Artifact title" }));
    expect((await dragFiles(page, "drop", [png], { x: title.x + 30, y: title.y + title.height / 2 })).prevented).toBe(true);
    await expectPicturesDrawn(page, 1);
    expect(await outline(page)).toEqual(["<image>", "Stored words."]);
    await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("/api/files/");
  });

  test("should take the line away when the files leave the window, and when the drag is not heard from again", async ({ page }) => {
    await writeDocument(page, "Line", ["Here.", "There."]);
    const png = { name: "Held.png", type: "image/png", bytes: await pngBytes(page) };
    const here = await boxOf(documentOf(page).getByText("Here.", { exact: true }));
    const point = { x: here.x + 20, y: here.y + 4 };
    expect((await dragFiles(page, "dragover", [png], point)).lineTop).not.toBeNull();
    // Out of the window: browsers send a dragleave with no element to go to.
    await page.evaluate(() => { document.body.dispatchEvent(new DragEvent("dragleave", { clientX: 0, clientY: 0, relatedTarget: null, bubbles: true })); });
    await expect(landingLine(page)).toHaveCount(0);
    expect((await dragFiles(page, "dragover", [png], point)).lineTop).not.toBeNull();
    // A drag that ends where the page cannot hear it: the line still goes, by itself.
    await expect(landingLine(page)).toHaveCount(0, { timeout: 5000 });
    // Held over the list of artifacts, outside the document's page: no line, and the page does not take it.
    const list = await boxOf(page.locator("[data-slot=artifact-list] li").first());
    const outside = await dragFiles(page, "dragover", [png], { x: list.x + 20, y: list.y + 10 });
    expect(outside.lineTop).toBeNull();
    expect(outside.prevented).toBe(false);
    expect(await outline(page)).toEqual(["Here.", "There."]);
  });

  test("should say so and offer Try again when a dropped image cannot upload", async ({ page }) => {
    await writeDocument(page, "Refused", ["Words."]);
    await page.evaluate(() => { window.sessionStorage.setItem("fixture:fail-media", "1"); });
    const png = { name: "Refused.png", type: "image/png", bytes: await pngBytes(page) };
    const words = await boxOf(documentOf(page).getByText("Words.", { exact: true }));
    await dragFiles(page, "drop", [png], { x: words.x + 20, y: words.y + words.height - 2 });
    await expect(media(page).getByRole("alert")).toContainText("Refused.png: The upload did not finish. Check your connection and try again.");
    await expectNoAxeViolations(media(page));
    await media(page).getByRole("button", { name: "Try again" }).click();
    await expectPicturesDrawn(page, 1);
  });
});

test.describe("dropping files on a document's own page", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should take an image dropped on the page's title, and leave one dropped outside the page's column to the browser", async ({ page }) => {
    await page.goto("/dev/editor?kind=markdown");
    const text = page.locator('.rich-editor-content[contenteditable="true"]');
    await expect(text.getByRole("heading", { name: "Section 1", exact: true })).toBeVisible();
    const png = { name: "On the page.png", type: "image/png", bytes: await pngBytes(page) };
    const title = await boxOf(page.getByRole("textbox", { name: "Title", exact: true }));
    const onTitle = { x: title.x + 30, y: title.y + title.height / 2 };
    const held = await dragFiles(page, "dragover", [png], onTitle);
    expect(held.prevented, "the page takes the held file").toBe(true);
    const firstBlock = await boxOf(text.getByRole("heading", { name: "Section 1", exact: true }));
    expect(held.lineTop, "the line sits above the first block").toBeLessThan(firstBlock.y);
    expect((await dragFiles(page, "drop", [png], onTitle)).prevented).toBe(true);
    await expect(text.locator('[data-media-state="ready"] img')).toHaveCount(1, { timeout: 15_000 });
    expect((await outlineOf(text)).slice(0, 2)).toEqual(["<image>", "Section 1"]);
    await expect(landingLine(page)).toHaveCount(0);

    // The header is not part of the document's page: nothing is taken there, and no line shows.
    const header = await boxOf(page.getByRole("banner").first());
    const outside = await dragFiles(page, "dragover", [png], { x: header.x + header.width / 2, y: header.y + header.height / 2 });
    expect(outside.prevented).toBe(false);
    expect(outside.lineTop).toBeNull();
  });
});

test("should put a pasted image in the text where the cursor is", async ({ page }) => {
  await writeDocument(page, "Pasted", ["Before the picture."]);
  const bytes = await pngBytes(page);
  await documentOf(page).evaluate((element, file) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(file)], "image.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, bytes);
  await expectPicturesDrawn(page, 1);
  expect(await outline(page)).toEqual(["Before the picture.", "<image>"]);
  await expect(filesList(page)).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("/api/files/");
});

test("should show a file's name and progress while it uploads, and take it out of the text when Cancel is chosen", async ({ page }) => {
  await writeDocument(page, "Cancelled", ["Words."]);
  // Held, so the block stays in progress.
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-media", "1"); });
  const bytes = await pngBytes(page);
  await documentOf(page).evaluate((element, file) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(file)], "Slow.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, bytes);
  const uploading = documentOf(page).getByRole("group", { name: "Uploading Slow.png" });
  await expect(uploading).toContainText("Slow.png");
  await expect(uploading.getByRole("progressbar", { name: "Uploading Slow.png" })).toBeVisible();
  await expectNoAxeViolations(uploading);
  await uploading.getByRole("button", { name: "Cancel the upload of Slow.png" }).click();
  await expect(media(page)).toHaveCount(0);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-media"); window.dispatchEvent(new Event("fixture:release-media")); });
  expect(await outline(page)).toEqual(["Words."]);
  // The upload that finished late is in no save.
  await documentOf(page).getByText("Words.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" More.");
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("More.");
  expect((await storedNew(page))[0]?.content).not.toContain("/api/files/");
  expect((await storedNew(page))[0]?.files).toHaveLength(0);
});

test("should put a picked file into the document when Upload files is used on an empty page", async ({ page }) => {
  await openNewArtifact(page);
  const bytes = await pngBytes(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload files" }).click();
  await (await chooser).setFiles({ name: "Picked.png", mimeType: "image/png", buffer: Buffer.from(bytes) });
  await expectPicturesDrawn(page, 1);
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("markdown");
  expect((await storedNew(page))[0]?.content).toContain("/api/files/");
  await expect(page.getByRole("region", { name: "Files", exact: true })).toHaveCount(0);
  await expect(uploadBox(page)).toHaveCount(0);
});

/** Gives the stored document a plain attachment, as files_attach or the old Files section left one, and opens it from the list. */
async function openWithAttachment(page: Page, title: string) {
  await writeDocument(page, title, ["Words before."]);
  await page.evaluate((fileId) => {
    const list = JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as { files: unknown[] }[];
    list[0]?.files.push({ id: fileId, filename: "IMG_6266.png", contentType: "image/png", size: 270_336, createdAt: new Date().toISOString(), replacedAt: null });
    window.sessionStorage.setItem("fixture:new-artifacts", JSON.stringify(list));
  }, attachedImageId);
  await page.reload();
  await cards(page, title).click();
  await expect(page.getByRole("region", { name: `Edit ${title}` })).toBeVisible();
  await expect(documentOf(page).getByText("Words before.", { exact: true })).toBeVisible();
}

test("should list a file that is attached and not in the text, with no upload box, and put it in the text on Add to document", async ({ page }) => {
  await openWithAttachment(page, "Has an attachment");
  const list = filesList(page);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("IMG_6266.png");
  await expect(list).toContainText("1 file, not shown on the page");
  await expect(list.getByLabel("Open IMG_6266.png")).toBeVisible();
  await expect(list.getByRole("button", { name: "Remove IMG_6266.png" })).toBeVisible();
  await expect(uploadBox(page), "no upload box").toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose files" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Files", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(list);

  await list.getByRole("button", { name: "Add to document: IMG_6266.png" }).click();
  await expectPicturesDrawn(page, 1);
  expect(await outline(page)).toEqual(["Words before.", "<image>"]);
  // In the text now, so the list has nothing left and is gone.
  await expect(filesList(page)).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain(`/api/files/${attachedImageId}`);
  expect((await storedNew(page))[0]?.files.map((file) => file.id), "the attachment is linked, not copied").toEqual([attachedImageId]);

  // Taken out of the text again, the file is still attached, so it is listed again.
  await media(page).first().click();
  await page.keyboard.press("Backspace");
  await expect(media(page)).toHaveCount(0);
  await expect(filesList(page).getByRole("listitem")).toHaveCount(1);
});

test("should keep the list without Add to document while the source is shown", async ({ page }) => {
  await openWithAttachment(page, "Source view");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact source" })).toBeVisible();
  await expect(filesList(page).getByRole("listitem")).toHaveCount(1);
  await expect(filesList(page).getByRole("button", { name: /Add to document/ })).toHaveCount(0);
});
