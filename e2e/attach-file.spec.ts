import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { attachedList, pasteTable } from "./support/new-page";
import { allowPageError, expect, test } from "./support/test";
import { body, cards, documentOf, dragFilesAt, openNewArtifact, pointIn, storedNew } from "./support/workspace-files";

/**
 * A saved artifact that is not a document (code, text, JSON, CSV, SVG, a
 * diagram, a web page) takes another file: "Attach file" in its More menu
 * and beside the "Attached files" heading, and a file dropped anywhere on
 * its page. The file is a plain attachment, listed under the content. A
 * document has neither: its files go into its text. Checked in the
 * workspace on /dev/workspace (a table) and on the artifact's own page on
 * /dev/editor (a JSON artifact); both keep files in the tab.
 */

const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
const dropHint = (page: Page) => page.locator("[data-slot=attach-drop-hint]");

/** A stored table with a title: a format that keeps its attachments beside its content. */
async function storeTable(page: Page, title: string) {
  allowPageError("/api/files/", "The /dev/workspace stand-in keeps uploads in the tab, so the file route, which has no database here, cannot serve them.");
  await openNewArtifact(page);
  await page.keyboard.type(title);
  await expect(cards(page, title)).toHaveCount(1);
  await pasteTable(page);
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("csv");
}

/** Opens the stored table from the list, as on any later visit. */
async function reopenFromList(page: Page, title: string) {
  await cards(page, "Long ui fixture").click();
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
  await cards(page, title).click();
  await expect(page.getByRole("region", { name: `Edit ${title}` })).toBeVisible();
  await expect(body(page).getByRole("grid")).toBeVisible();
}

/** Chooses files in the picker that `open` opens. */
async function pick(page: Page, open: () => Promise<void>, names: readonly string[]) {
  const chooser = page.waitForEvent("filechooser");
  await open();
  await (await chooser).setFiles(names.map(pdf));
}

async function attachFromMenu(page: Page, more: Locator, names: readonly string[]) {
  await pick(page, async () => {
    await more.click();
    await page.getByRole("menuitem", { name: "Attach file" }).click();
  }, names);
}

test("should attach a file from Attach file in the More menu of a saved table, and from the button beside Attached files", async ({ page }) => {
  await storeTable(page, "Table with files");
  const editor = page.getByRole("region", { name: "Edit Table with files" });
  const more = editor.getByRole("button", { name: "More actions" });
  await expect(attachedList(page), "nothing attached yet, so no list").toHaveCount(0);

  // On the page it was made on.
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Attach file" })).toBeVisible();
  await expectNoAxeViolations(page.getByRole("menu"));
  await page.keyboard.press("Escape");
  await attachFromMenu(page, more, ["Source.pdf"]);
  await expect(attachedList(page).getByRole("listitem")).toHaveCount(1);
  await expect(attachedList(page)).toContainText("Source.pdf");
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);

  // Opened from the list later: the menu again, two files at once.
  await reopenFromList(page, "Table with files");
  await attachFromMenu(page, more, ["Second.pdf", "Third.pdf"]);
  await expect(attachedList(page).getByRole("listitem")).toHaveCount(3);

  // And the button beside the heading.
  const beside = attachedList(page).getByRole("button", { name: "Attach file" });
  await expect(beside).toBeVisible();
  await expectNoAxeViolations(attachedList(page));
  await pick(page, () => beside.click(), ["Fourth.pdf"]);
  await expect(attachedList(page).getByRole("listitem")).toHaveCount(4);
  await expect.poll(async () => (await storedNew(page))[0]?.files.map((file) => file.filename), { timeout: 15_000 }).toEqual(["Source.pdf", "Second.pdf", "Third.pdf", "Fourth.pdf"]);
  expect((await storedNew(page))[0]?.content, "the table is as it was").toBe("name,value\nAda,1\nBo,2");
});

test("should say why in the file's own row when it cannot be attached, and let it be removed", async ({ page }) => {
  await storeTable(page, "Refused attach");
  await reopenFromList(page, "Refused attach");
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:next-attach", "refuse"); });
  await attachFromMenu(page, page.getByRole("region", { name: "Edit Refused attach" }).getByRole("button", { name: "More actions" }), ["Refused.pdf"]);
  const list = attachedList(page);
  const row = list.getByRole("list", { name: "Uploads" }).getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Refused.pdf");
  await expect(row.getByRole("alert")).toHaveText("The files could not be added. Try again.");
  await expectNoAxeViolations(list);
  await row.getByRole("button", { name: "Remove Refused.pdf" }).click();
  // Nothing attached and nothing on its way: the list is gone again.
  await expect(list).toHaveCount(0);
  expect((await storedNew(page))[0]?.files).toHaveLength(0);
});

test("should not offer Attach file for a document", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("A document");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Words.");
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("Words.");
  await page.getByRole("region", { name: "Edit A document" }).getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "View source" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach file" })).toHaveCount(0);
  await expect(documentOf(page)).toBeVisible();
});

test.describe("dropping a file on a saved table's page", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should say where a held file will go, and attach it when it is dropped anywhere on the page", async ({ page }) => {
    await storeTable(page, "Table drop");
    await reopenFromList(page, "Table drop");
    const file = [{ name: "Dropped.pdf", type: "application/pdf" }];
    const onGrid = await pointIn(body(page).getByRole("grid"), 12);
    expect((await dragFilesAt(page, "dragover", file, onGrid)).prevented, "the page takes the file").toBe(true);
    await expect(dropHint(page)).toHaveText("Drop to attach it to this artifact");
    await expectNoAxeViolations(attachedList(page));
    // The file leaves the window: the hint goes, and with nothing attached so does the list.
    await body(page).getByRole("grid").evaluate((grid) => { grid.dispatchEvent(new DragEvent("dragleave", { bubbles: true, relatedTarget: null })); });
    await expect(dropHint(page)).toHaveCount(0);
    await expect(attachedList(page)).toHaveCount(0);

    // Dropped on the title this time.
    const onTitle = await pointIn(page.getByRole("textbox", { name: "Artifact title" }), 10);
    await dragFilesAt(page, "dragover", file, onTitle);
    await expect(dropHint(page)).toBeVisible();
    expect((await dragFilesAt(page, "drop", file, onTitle)).prevented).toBe(true);
    await expect(dropHint(page)).toHaveCount(0);
    await expect(attachedList(page).getByRole("listitem")).toHaveCount(1);
    await expect(attachedList(page)).toContainText("Dropped.pdf");
    await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
    expect((await storedNew(page))[0]?.content, "the table is as it was").toBe("name,value\nAda,1\nBo,2");
  });
});

test.describe("the artifact's own page", () => {
  const more = (page: Page) => page.getByRole("banner").getByRole("button", { name: "More actions" });

  test("should attach a file from Attach file in the header's More menu, list it under the content, and say why one is refused", async ({ page }) => {
    await page.goto("/dev/editor?kind=json");
    await expect(more(page)).toBeEnabled();
    await expect(attachedList(page)).toHaveCount(0);
    await more(page).click();
    await expect(page.getByRole("menuitem", { name: "Attach file" })).toBeVisible();
    await expectNoAxeViolations(page.getByRole("menu"));
    await page.keyboard.press("Escape");
    await attachFromMenu(page, more(page), ["Schema.pdf"]);
    const list = attachedList(page);
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Schema.pdf");
    await expect(list.getByRole("button", { name: "Attach file" })).toBeVisible();
    await expectNoAxeViolations(list);

    // The fixture refuses a file named "refused…", as the server refuses one past the artifact's limit.
    await attachFromMenu(page, more(page), ["refused.pdf"]);
    const problem = list.getByRole("list", { name: "Uploads" }).getByRole("alert");
    await expect(problem).toHaveText("An artifact holds at most 20 files. Remove some first.");
    await expectNoAxeViolations(list);
    await list.getByRole("button", { name: "Remove refused.pdf" }).click();
    await expect(problem).toHaveCount(0);
    await expect(list.getByRole("listitem")).toHaveCount(1);
  });

  test("should attach a file dropped anywhere on the page", async ({ page, isMobile }) => {
    test.skip(isMobile, "Files are dragged from a desktop.");
    await page.goto("/dev/editor?kind=json");
    await expect(more(page)).toBeEnabled();
    const file = [{ name: "Dropped.pdf", type: "application/pdf" }];
    const onTitle = await pointIn(page.getByRole("heading", { level: 1 }), 10);
    expect((await dragFilesAt(page, "dragover", file, onTitle)).prevented).toBe(true);
    await expect(dropHint(page)).toHaveText("Drop to attach it to this artifact");
    await expectNoAxeViolations(attachedList(page));
    expect((await dragFilesAt(page, "drop", file, onTitle)).prevented).toBe(true);
    await expect(dropHint(page)).toHaveCount(0);
    await expect(attachedList(page).getByRole("listitem")).toHaveCount(1);
    await expect(attachedList(page)).toContainText("Dropped.pdf");
  });

  test("should not offer Attach file on a document's page", async ({ page }) => {
    await page.goto("/dev/editor?kind=markdown");
    await expect(more(page)).toBeEnabled();
    await more(page).click();
    await expect(page.getByRole("menuitem", { name: "View source" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Attach file" })).toHaveCount(0);
  });
});
