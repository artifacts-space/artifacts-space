import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { allowPageError, expect, test } from "./support/test";
import { body, cards, documentOf, dragFilesAt, media, outline, pasteFiles, pointIn, storedNew, writeDocument } from "./support/workspace-files";

/**
 * No file is lost in a document. Every file of a drop is taken, however
 * many, and one that cannot be added keeps a block that says why. A file
 * dropped or pasted on the document's source (View source) is uploaded and
 * written into the source. The files that are attached and not in the text
 * go into it in one click. Checked on /dev/workspace, whose stand-in keeps
 * uploads in the tab.
 */

const pdf = (name: string) => ({ name, type: "application/pdf" });
const numbered = (count: number) => Array.from({ length: count }, (_, index) => pdf(`File-${String(index + 1).padStart(3, "0")}.pdf`));
const namesIn = (content: string) => [...content.matchAll(/!\[(File-\d+\.pdf)\]/g)].map((match) => match[1]);
const uploading = (page: Page) => media(page).getByRole("group", { name: /^Uploading / });
const sourceField = (page: Page) => page.getByRole("textbox", { name: "Artifact source" });
const sourceUploads = (page: Page) => page.locator("[data-slot=source-uploads]");
const filesList = (page: Page) => page.getByRole("region", { name: "Attached files" });

async function openSource(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  await expect(sourceField(page)).toBeVisible();
}

test.describe("dropping many files on a document", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should take every one of 30 files dropped at once, each in its own block, in the order they were dropped", async ({ page }) => {
    await writeDocument(page, "Thirty", ["Above.", "Below."]);
    const files = numbered(30);
    const above = await pointIn(documentOf(page).getByText("Above.", { exact: true }), 20);
    expect((await dragFilesAt(page, "drop", files, above)).prevented).toBe(true);
    // Every file has its block at once, before any upload finishes.
    await expect(media(page)).toHaveCount(30);
    await expect(uploading(page), "every upload finished").toHaveCount(0, { timeout: 30_000 });
    await expect(media(page).getByRole("alert")).toHaveCount(0);
    await expect.poll(async () => namesIn((await storedNew(page))[0]?.content ?? "").length, { timeout: 30_000 }).toBe(30);
    expect(namesIn((await storedNew(page))[0]?.content ?? "")).toEqual(files.map((file) => file.name));
    expect((await outline(page)).at(0)).toBe("Above.");
    expect((await outline(page)).at(-1)).toBe("Below.");
  });

  test("should keep a block for a file that cannot be added, with the reason and Remove, and take the files around it", async ({ page }) => {
    await writeDocument(page, "Refused files", ["Words."]);
    const files = [pdf("Good.pdf"), { name: "Huge.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }, { name: "setup.exe", type: "application/x-msdownload" }, { name: "Empty.pdf", type: "application/pdf", size: 0 }, pdf("Also good.pdf")];
    await dragFilesAt(page, "drop", files, await pointIn(documentOf(page).getByText("Words.", { exact: true }), 20));
    await expect(media(page)).toHaveCount(5);
    const refused = media(page).getByRole("alert");
    await expect(refused).toHaveCount(3);
    await expect(refused.nth(0)).toContainText("Huge.pdf");
    await expect(refused.nth(0)).toContainText("25 MB");
    await expect(refused.nth(1)).toContainText("setup.exe");
    await expect(refused.nth(2)).toContainText("Empty.pdf");
    // A file that was refused cannot be sent again: only Remove.
    const refusedBlocks = media(page).filter({ has: page.getByRole("alert") });
    await expect(refusedBlocks.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(refusedBlocks.getByRole("button", { name: "Remove", exact: true })).toHaveCount(3);
    await expectNoAxeViolations(refusedBlocks.first());
    // The good files are stored; a refused one never is.
    await expect.poll(async () => ((await storedNew(page))[0]?.content.match(/\/api\/files\//g) ?? []).length, { timeout: 15_000 }).toBe(2);
    for (let left = 3; left > 0; left -= 1) {
      await refusedBlocks.getByRole("button", { name: "Remove", exact: true }).first().click();
      await expect(refused).toHaveCount(left - 1);
    }
    expect(await outline(page)).toEqual(["Words.", "<pdf>", "<pdf>"]);
  });

  test("should say that a document is full for the file past the 100 it shows, and take the 100", async ({ page }) => {
    test.slow();
    await writeDocument(page, "Full", ["Words."]);
    await dragFilesAt(page, "drop", numbered(101), await pointIn(documentOf(page).getByText("Words.", { exact: true }), 20));
    await expect(media(page)).toHaveCount(101);
    await expect(media(page).getByRole("alert")).toHaveCount(1);
    await expect(media(page).getByRole("alert")).toHaveText("File-101.pdf: A document shows at most 100 files. Remove some, then add this one again.");
    await expect(uploading(page), "every upload finished").toHaveCount(0, { timeout: 60_000 });
    await expect.poll(async () => namesIn((await storedNew(page))[0]?.content ?? "").length, { timeout: 60_000 }).toBe(100);
  });

  test("should write a file dropped on a line of the source under that line, and take it out again on Undo", async ({ page }) => {
    await writeDocument(page, "Source drop", ["First line.", "Second line."]);
    await openSource(page);
    const field = sourceField(page);
    const before = await field.inputValue();
    expect(before).toMatch(/^First line\.\n\nSecond line\.\n?$/);
    // The first line of the field: under its top padding, half a line down.
    const lineOne = await field.evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.lineHeight) / 2;
    });
    expect((await dragFilesAt(page, "drop", [pdf("Brief.pdf")], await pointIn(field, lineOne))).prevented).toBe(true);
    await expect(field).toHaveValue(/^First line\.\n\n!\[Brief\.pdf\]\(\/api\/files\/[0-9a-f-]+#pdf\)\n\nSecond line\.\n?$/, { timeout: 15_000 });
    await expect(sourceUploads(page).getByRole("listitem")).toHaveCount(0);
    await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
    // The line was typed in, so the field's own Undo takes it out.
    await field.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(field).toHaveValue(before);
  });
});

test("should upload a file pasted on the source, show it by name while it uploads, and write its line at the cursor", async ({ page }) => {
  await writeDocument(page, "Source paste", ["Only line."]);
  await openSource(page);
  const field = sourceField(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-media", "1"); });
  await field.focus();
  await pasteFiles(field, [{ name: "Pasted.zip", type: "application/zip", size: 64 }]);
  const row = sourceUploads(page).getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Pasted.zip");
  await expectNoAxeViolations(sourceUploads(page));
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-media"); window.dispatchEvent(new Event("fixture:release-media")); });
  await expect(field).toHaveValue(/^Only line\.\n\n!\[Pasted\.zip\]\(\/api\/files\/[0-9a-f-]+#file\)\n$/, { timeout: 15_000 });
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("#file)");
});

test("should say why under the source when a pasted file cannot upload, and leave the source as it was", async ({ page }) => {
  await writeDocument(page, "Source refusal", ["Only line."]);
  await openSource(page);
  const field = sourceField(page);
  const before = await field.inputValue();
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:fail-media", "1"); });
  await field.focus();
  await pasteFiles(field, [pdf("Lost.pdf"), { name: "Huge.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }]);
  const problems = sourceUploads(page).getByRole("alert");
  await expect(problems).toHaveCount(2);
  await expect(problems.nth(0)).toHaveText("The upload did not finish. Check your connection and try again.");
  await expect(problems.nth(1)).toContainText("25 MB");
  await expectNoAxeViolations(sourceUploads(page));
  await expect(field).toHaveValue(before);
  await sourceUploads(page).getByRole("button", { name: /^Remove / }).first().click();
  await sourceUploads(page).getByRole("button", { name: /^Remove / }).first().click();
  await expect(sourceUploads(page).getByRole("listitem")).toHaveCount(0);
  await expect(field).toHaveValue(before);
});

/** The file the fixture shows a real image for (fixtureAttachedImageId), and one it only knows by name. */
const attachedImageId = "00000000-0000-4000-8000-0000000000a1";
const attachedZipId = "00000000-0000-4000-8000-0000000000b2";

test("should put every attached file into the text at the cursor on Add all to document, and take them out on one Undo", async ({ page }) => {
  allowPageError("/api/files/", "The /dev/workspace stand-in has no database, so the file route cannot serve the attached archive.");
  await writeDocument(page, "Two attachments", ["Words before.", "Words after."]);
  // Two plain attachments, as files_attach leaves them.
  await page.evaluate(([imageId, zipId]) => {
    const list = JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as { files: unknown[] }[];
    const at = new Date().toISOString();
    list[0]?.files.push({ id: imageId, filename: "IMG_6266.png", contentType: "image/png", size: 270_336, createdAt: at, replacedAt: null });
    list[0]?.files.push({ id: zipId, filename: "Archive.zip", contentType: "application/zip", size: 2048, createdAt: at, replacedAt: null });
    window.sessionStorage.setItem("fixture:new-artifacts", JSON.stringify(list));
  }, [attachedImageId, attachedZipId] as const);
  await page.reload();
  await cards(page, "Two attachments").click();
  await expect(page.getByRole("region", { name: "Edit Two attachments" })).toBeVisible();
  const list = filesList(page);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("2 files, not shown on the page");
  const addAll = list.getByRole("button", { name: "Add all to document" });
  await expect(addAll).toBeVisible();
  await expectNoAxeViolations(list);

  // The cursor is in the first paragraph: the files go under it, not at the end.
  await documentOf(page).getByText("Words before.", { exact: true }).click();
  await addAll.click();
  await expect(media(page)).toHaveCount(2);
  expect(await outline(page)).toEqual(["Words before.", "<image>", "<file>", "Words after."]);
  await expect(filesList(page)).toHaveCount(0);
  await expect.poll(async () => ((await storedNew(page))[0]?.content.match(/\/api\/files\//g) ?? []).length, { timeout: 15_000 }).toBe(2);
  expect((await storedNew(page))[0]?.files.map((file) => file.id).sort(), "the attachments are linked, not copied").toEqual([attachedImageId, attachedZipId]);

  // One step back takes both out of the text; they are still attached, so they are listed again.
  await documentOf(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(media(page)).toHaveCount(0);
  await expect(filesList(page).getByRole("listitem")).toHaveCount(2);
  expect(await outline(page)).toEqual(["Words before.", "Words after."]);
  await expect(body(page)).toBeVisible();
});
