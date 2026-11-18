import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";
import { dragFilesAt, openNewArtifact, pointIn, storedNew } from "./support/workspace-files";

/*
 * A web page's files from the web app, on the artifact page fixture
 * (/dev/editor?kind=html, `&files=1` to start with css/site.css and
 * img/logo.png). Its page files stay in the tab (fixture-page-files.ts),
 * which answers as the server does and counts what it was asked on
 * `window.fixturePageFiles`, so each test can prove that a set went in as
 * one publish, which requests it took, and what was aborted.
 */

interface Counts { requests: number[]; puts: number; aborts: number; publishes: { added: string[]; replaced: string[]; removed: string[] }[]; discards: number }

const counts = (page: Page) => page.evaluate(() => (window as unknown as { fixturePageFiles?: Counts }).fixturePageFiles ?? { requests: [], puts: 0, aborts: 0, publishes: [], discards: 0 });
const section = (page: Page) => page.getByRole("region", { name: "Files" });
const pageFiles = (page: Page) => section(page).getByRole("list", { name: "Page files" });
const batch = (page: Page) => section(page).locator("[data-slot=page-batch]");
const more = (page: Page) => page.getByRole("banner").getByRole("button", { name: "More actions" });

/** A file to pick: its name, and its bytes as text. */
interface Picked { name: string; text?: string; mimeType?: string }

const payload = ({ name, text = "body { color: black; }", mimeType = "" }: Picked) => ({ name, mimeType, buffer: Buffer.from(text) });

async function open(page: Page, query = "") {
  await page.goto(`/dev/editor?kind=html${query}`);
  await expect(more(page)).toBeEnabled();
}

/** Picks files with "Add files" in the header's More menu. */
async function addFromMenu(page: Page, files: readonly Picked[]) {
  const chooser = page.waitForEvent("filechooser");
  await more(page).click();
  await page.getByRole("menuitem", { name: "Add files" }).click();
  await (await chooser).setFiles(files.map(payload));
}

/** Writes a folder of files under the test's output folder and returns its path. */
function folderOf(root: string, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

/** Picks a folder with the list's "Add folder". */
async function addFolder(page: Page, folder: string) {
  await page.locator("[data-slot=add-folder-input]").setInputFiles(folder);
}

const pathsShown = (list: Locator) => list.locator("[data-slot=page-file-row] .font-mono").allTextContents();

test("should add picked files where their types belong, as one publish: page files by path and the rest as attachments", async ({ page }) => {
  await open(page);
  await more(page).click();
  await expect(page.getByRole("menuitem", { name: "Add files" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach file" })).toHaveCount(0);
  await expectNoAxeViolations(page.getByRole("menu"));
  await page.keyboard.press("Escape");

  await addFromMenu(page, [{ name: "site.css" }, { name: "app.js", text: "console.log(1);" }, { name: "brief.pdf", text: "%PDF-1.4", mimeType: "application/pdf" }]);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["app.js", "site.css"]);
  const attachments = section(page).getByRole("list", { name: "Attachments" });
  await expect(attachments.getByRole("listitem")).toHaveCount(1);
  await expect(attachments).toContainText("brief.pdf");
  await expect(attachments).toContainText("Attachment · PDF");
  await expect(section(page).locator("[data-slot=page-files-room]")).toHaveText(/^2 of 100 files, \d+ B of 16 MB$/);
  const asked = await counts(page);
  expect(asked.requests, "one request for the two page files").toEqual([2]);
  expect(asked.publishes, "one publish, one version").toEqual([{ added: ["site.css", "app.js"], replaced: [], removed: [] }]);
  await expectNoAxeViolations(section(page));
  await pageFiles(page).getByRole("button", { name: "Copy path" }).first().focus();
  await expect(pageFiles(page).getByRole("button", { name: "Open app.js" })).toHaveAttribute("href", /^\/api\/files\//);
});

test("should keep a picked folder's shape, leave out hidden files with one quiet line, and offer its index.html as the page", async ({ page }, testInfo) => {
  await open(page);
  const folder = folderOf(testInfo.outputPath("site"), {
    "css/site.css": "body { color: green; }",
    "img/logo.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    ".DS_Store": "x",
    ".git/config.json": "{}",
    "index.html": "<!doctype html><html lang=\"en\"><head><title>From the folder</title></head><body><p id=\"from-folder\">From the folder</p></body></html>",
  });
  await addFolder(page, folder);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["css/site.css", "img/logo.svg"]);
  await expect(section(page).locator("[data-slot=page-files-left-out]")).toHaveText("Left out 2 hidden or system files.");
  const pageRow = section(page).locator("[data-slot=page-html-row]");
  await expect(pageRow).toContainText("This is the page itself");
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes).toHaveLength(1);

  // Using it replaces the page's HTML through the normal save, after a confirm that says what is replaced.
  await pageRow.getByRole("button", { name: "Use as this page's HTML" }).click();
  const dialog = page.getByRole("dialog", { name: "Use index.html as this page's HTML?" });
  await expect(dialog).toContainText("The HTML it has now stays in History");
  await expect(dialog.getByRole("checkbox", { name: "Don't ask again" })).toBeVisible();
  await expectNoAxeViolations(dialog);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoAxeViolations(dialog);
  await page.emulateMedia({ colorScheme: "light" });
  await dialog.getByRole("button", { name: "Use as this page's HTML" }).click();
  await expect(pageRow).toHaveCount(0);
  await more(page).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact source" })).toHaveValue(/From the folder/);
});

test("should show a path a person can fix, with a cleaned suggestion, and add the file only once it is fixed", async ({ page }) => {
  await open(page);
  await addFromMenu(page, [{ name: "Hero Image.css" }, { name: "ok.css" }]);
  const row = batch(page).locator("[data-slot=page-batch-row]").filter({ hasText: "Hero Image.css" });
  await expect(row.getByRole("alert")).toContainText("letters, digits, dots, dashes, and underscores");
  const field = row.getByRole("textbox", { name: "Path for Hero Image.css" });
  await expect(field).toHaveValue("hero-image.css");
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes, "nothing is published while a path needs fixing").toHaveLength(0);
  await row.getByRole("button", { name: "Use path" }).click();
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["hero-image.css", "ok.css"]);
  expect((await counts(page)).publishes).toEqual([{ added: ["hero-image.css", "ok.css"], replaced: [], removed: [] }]);
});

test("should say which files a set replaces before it publishes, let one be left out, and replace on the person's word", async ({ page }, testInfo) => {
  await open(page, "&files=1");
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["css/site.css", "img/logo.png"]);
  await addFolder(page, folderOf(testInfo.outputPath("update"), { "css/site.css": "body { color: red; }", "img/logo.png": "png", "js/new.js": "1;" }));
  await expect(batch(page).locator("[data-slot=page-batch-replaces]")).toHaveCount(2);
  expect((await batch(page).locator("[data-slot=page-batch-replaces]").allTextContents()).sort()).toEqual(["Replaces css/site.css", "Replaces img/logo.png"]);
  const go = batch(page).getByRole("button", { name: "Add and replace 3 files" });
  await expect(go).toBeVisible();
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes, "nothing is replaced before the person says so").toHaveLength(0);
  await batch(page).getByRole("button", { name: "Leave out img/logo.png" }).click();
  await batch(page).getByRole("button", { name: "Add and replace 2 files" }).click();
  await expect(batch(page)).toHaveCount(0);
  expect((await counts(page)).publishes).toEqual([{ added: ["js/new.js"], replaced: ["css/site.css"], removed: [] }]);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["css/site.css", "img/logo.png", "js/new.js"]);
});

test("should replace one page file at its own path from its row, and remove one as its own change", async ({ page }) => {
  await open(page, "&files=1");
  const chooser = page.waitForEvent("filechooser");
  await pageFiles(page).getByRole("button", { name: "Replace css/site.css" }).click();
  await (await chooser).setFiles([payload({ name: "new-styles.css" })]);
  await expect.poll(async () => (await counts(page)).publishes).toEqual([{ added: [], replaced: ["css/site.css"], removed: [] }]);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["css/site.css", "img/logo.png"]);

  // A file of another type cannot take a page file's path.
  const wrong = page.waitForEvent("filechooser");
  await pageFiles(page).getByRole("button", { name: "Replace css/site.css" }).click();
  await (await wrong).setFiles([payload({ name: "logo.png" })]);
  await expect(section(page).getByRole("list", { name: "Not added" }).getByRole("alert")).toContainText("Pick a file of the same type (Stylesheet)");

  await pageFiles(page).getByRole("button", { name: "Remove img/logo.png" }).click();
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["css/site.css"]);
  expect((await counts(page)).publishes.at(-1)).toEqual({ added: [], replaced: [], removed: ["img/logo.png"] });
});

test("should stop every upload with Cancel, publish nothing, and ask before the tab closes while files are on their way", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-page-uploads", "1"); });
  await addFromMenu(page, ["a.css", "b.css", "c.css", "d.css", "e.css"].map((name) => ({ name })));
  await expect(batch(page).locator("[data-slot=page-batch-row]")).toHaveCount(5);
  // Three at a time: the other two wait for a free place.
  await expect.poll(async () => (await counts(page)).puts).toBe(3);
  await expectNoAxeViolations(section(page));
  const asks = await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  expect(asks, "the tab asks before it closes").toBe(true);
  await batch(page).getByRole("button", { name: "Cancel" }).click();
  await expect(batch(page)).toHaveCount(0);
  const after = await counts(page);
  expect(after.aborts, "the three running requests were aborted").toBe(3);
  expect(after.publishes).toHaveLength(0);
  expect(after.discards, "every started upload was deleted").toBe(5);
});

test("should say why a file is refused in its own row, offer Try again for a failed upload, and Try again for a refused publish", async ({ page }) => {
  await open(page);
  await addFromMenu(page, [{ name: "setup.exe" }, { name: "about.html", text: "<!doctype html>" }, { name: "broken.css" }, { name: "fine.css" }]);
  const notAdded = section(page).getByRole("list", { name: "Not added" });
  await expect(notAdded.getByRole("alert")).toHaveCount(2);
  await expect(notAdded).toContainText("This file type is not supported.");
  await expect(notAdded).toContainText("A page file cannot be another HTML document");
  const broken = batch(page).locator("[data-slot=page-batch-row]").filter({ hasText: "broken.css" });
  await expect(broken.getByRole("alert")).toHaveText("The file does not look like the type its path says. Upload the file again.");
  await expect(broken.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes, "a failed upload holds the set").toHaveLength(0);

  // Leaving the failed one out lets the rest go, but this publish is refused: the server's words, and Try again.
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:next-page-publish", "refuse"); });
  await batch(page).getByRole("button", { name: "Leave out broken.css" }).click();
  await expect(batch(page).getByRole("alert")).toContainText("nothing was changed");
  await expectNoAxeViolations(section(page));
  await batch(page).getByRole("button", { name: "Try again" }).click();
  await expect(batch(page)).toHaveCount(0);
  expect((await counts(page)).publishes).toEqual([{ added: ["fine.css"], replaced: [], removed: [] }]);
});

test("should refuse a set that does not fit the page before anything uploads", async ({ page }) => {
  await open(page);
  await addFromMenu(page, Array.from({ length: 101 }, (_, index) => ({ name: `f${String(index)}.css` })));
  await expect(batch(page).getByRole("alert").first()).toContainText("A page holds at most 100 page files.");
  expect((await counts(page)).requests, "nothing was asked for").toEqual([]);
  await batch(page).getByRole("button", { name: "Leave out f100.css" }).click();
  await expect.poll(async () => (await counts(page)).requests, { timeout: 15_000 }).toEqual([50, 50]);
  await expect.poll(async () => (await counts(page)).publishes.length, { timeout: 15_000 }).toBe(1);
  expect((await counts(page)).publishes[0]?.added).toHaveLength(100);
});

test("should load the running page again with its new files, and keep saving the page's HTML after a files-only change", async ({ page }) => {
  await open(page);
  const frame = page.locator("iframe[data-slot=page-frame][data-page-shown]");
  await expect(frame).toBeVisible();
  await frame.evaluate((element) => { element.setAttribute("data-before-files", ""); });
  await addFromMenu(page, [{ name: "site.css" }]);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["site.css"]);
  await expect(page.locator("iframe[data-slot=page-frame][data-before-files]"), "a new frame loads with the files").toHaveCount(0);
  await expect(frame).toBeVisible();

  await more(page).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  const source = page.getByRole("textbox", { name: "Artifact source" });
  await source.focus();
  await source.evaluate((field: HTMLTextAreaElement) => { field.setSelectionRange(field.value.length, field.value.length); });
  await page.keyboard.type("<!-- edited -->");
  // The save goes through on the files-only version as its base: no conflict, no notice.
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", { timeout: 15_000 });
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["site.css"]);
});

test("should start a file again at its new path when the path is fixed while the old upload is checked, and publish both", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-page-checks", "1"); });
  await addFromMenu(page, [{ name: "a.css" }]);
  const rows = batch(page).locator("[data-slot=page-batch-row]");
  await expect(rows.first()).toContainText("Checking…");
  // A second file at the same path: both rows say so, and the first takes a new path while its upload is still checked.
  await addFromMenu(page, [{ name: "a.css", text: "p { margin: 0; }" }]);
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole("textbox", { name: "Path for a.css" }).fill("first.css");
  await rows.first().getByRole("button", { name: "Use path" }).click();
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-page-checks"); window.dispatchEvent(new Event("fixture:release-page-checks")); });
  await expect(batch(page)).toHaveCount(0);
  expect((await counts(page)).publishes).toEqual([{ added: ["first.css", "a.css"], replaced: [], removed: [] }]);
  await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["a.css", "first.css"]);
});

test("should keep a set as it is while it is being published, and refuse an empty file picked to replace a page file", async ({ page }) => {
  await open(page, "&files=1");
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-page-publish", "1"); });
  await addFromMenu(page, [{ name: "new.css" }]);
  await expect(batch(page)).toContainText("Adding 1 file to the page…");
  await expect(batch(page).getByRole("button", { name: "Leave out new.css" })).toBeDisabled();
  await expect(batch(page).getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-page-publish"); window.dispatchEvent(new Event("fixture:release-page-publish")); });
  await expect(batch(page)).toHaveCount(0);
  expect((await counts(page)).publishes).toEqual([{ added: ["new.css"], replaced: [], removed: [] }]);

  const chooser = page.waitForEvent("filechooser");
  await pageFiles(page).getByRole("button", { name: "Replace css/site.css" }).click();
  await (await chooser).setFiles([payload({ name: "site.css", text: "" })]);
  await expect(section(page).getByRole("list", { name: "Not added" }).getByRole("alert")).toHaveText("The file is empty. Choose a file with content.");
  await expect(batch(page)).toHaveCount(0);
});

test.describe("dropping files on the page", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should say a drop adds the files to this page, and send each where its type belongs", async ({ page }) => {
    await open(page);
    const files = [{ name: "drop.css", type: "text/css" }, { name: "notes.pdf", type: "application/pdf" }];
    const onTitle = await pointIn(page.getByRole("heading", { level: 1 }), 10);
    expect((await dragFilesAt(page, "dragover", files, onTitle)).prevented).toBe(true);
    await expect(section(page).locator("[data-slot=attach-drop-hint]")).toHaveText("Drop to add them to this page");
    await expectNoAxeViolations(section(page));
    expect((await dragFilesAt(page, "drop", files, onTitle)).prevented).toBe(true);
    await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["drop.css"]);
    await expect(section(page).getByRole("list", { name: "Attachments" })).toContainText("notes.pdf");
  });
});

test.describe("in the workspace pane", () => {
  test("should add a web page's files from Add files in its More menu, as one publish, and list them by path", async ({ page }) => {
    await openNewArtifact(page);
    const blank = page.getByRole("region", { name: "New artifact" });
    await blank.getByRole("button", { name: "Format" }).click();
    const dialog = page.getByRole("dialog", { name: "Format and language" });
    await dialog.getByRole("combobox", { name: "Format" }).click();
    await page.getByRole("option", { name: "HTML", exact: true }).click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("html");

    const editor = page.getByRole("region", { name: /^Edit / });
    const chooser = page.waitForEvent("filechooser");
    await editor.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Attach file" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Add files" }).click();
    await (await chooser).setFiles([payload({ name: "site.css" }), payload({ name: "logo.svg", text: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" }), payload({ name: "brief.pdf", text: "%PDF-1.4", mimeType: "application/pdf" })]);
    await expect.poll(async () => pathsShown(pageFiles(page))).toEqual(["logo.svg", "site.css"]);
    await expect(section(page).getByRole("list", { name: "Attachments" })).toContainText("brief.pdf");
    expect((await counts(page)).publishes).toEqual([{ added: ["site.css", "logo.svg"], replaced: [], removed: [] }]);
    await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(3);
    await expectNoAxeViolations(section(page));
  });
});
