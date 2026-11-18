import type { Page } from "@playwright/test";

import { buildZip, type TestZipEntry } from "../src/lib/zip/test-zip";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";
import { dragFilesAt, pointIn } from "./support/workspace-files";

/*
 * A zip dropped or picked on a web page, on the artifact page fixture
 * (/dev/editor?kind=html, `&files=1` to start with css/site.css and
 * img/logo.png). The zip is unpacked in the browser and its files go the
 * way a dropped folder's would; the fixture keeps page files in the tab and
 * counts what it was asked on `window.fixturePageFiles`, with the text of
 * each file sent, so a test can compare it with what the zip held.
 */

interface Counts { requests: number[]; publishes: { added: string[]; replaced: string[]; removed: string[] }[]; discards: number; sent: Record<string, string> }

const counts = (page: Page) => page.evaluate(() => (window as unknown as { fixturePageFiles?: Counts }).fixturePageFiles ?? { requests: [], publishes: [], discards: 0, sent: {} });
const section = (page: Page) => page.getByRole("region", { name: "Files" });
const pageFiles = (page: Page) => section(page).getByRole("list", { name: "Page files" });
const batch = (page: Page) => section(page).locator("[data-slot=page-batch]");
const notAdded = (page: Page) => section(page).getByRole("list", { name: "Not added" });
const fromZip = (page: Page) => section(page).locator("[data-slot=page-files-from-zip]");
const more = (page: Page) => page.getByRole("banner").getByRole("button", { name: "More actions" });
const pathsShown = (page: Page) => pageFiles(page).locator("[data-slot=page-file-row] .font-mono").allTextContents();

// The fixture's frame runs at the page host's root without page files, so the page the test puts in names none of them.
const indexHtml = "<!doctype html><html lang=\"en\"><head><title>From the zip</title></head><body><p id=\"from-zip\">From the zip</p></body></html>";
const siteCss = "#from-zip { color: rgb(0, 128, 0); }";
const appJs = "document.getElementById(\"from-zip\").dataset.ran = \"yes\";";
const aboutHtml = "<!doctype html><html lang=\"en\"><head><title>About</title><link rel=\"stylesheet\" href=\"css/site.css\"></head><body><p>About</p></body></html>";

const site: TestZipEntry[] = [
  { name: "site/", method: 0 },
  { name: "site/index.html", data: indexHtml },
  { name: "site/css/site.css", data: siteCss, method: 0 },
  { name: "site/js/app.js", data: appJs },
  { name: "site/about.html", data: aboutHtml },
  { name: "site/.DS_Store", data: "x" },
];

async function zipPayload(name: string, entries: readonly TestZipEntry[]) {
  const zip = await buildZip(entries);
  return { name, mimeType: "application/zip", buffer: Buffer.from(zip.bytes) };
}

async function open(page: Page, query = "") {
  await page.goto(`/dev/editor?kind=html${query}`);
  await expect(more(page)).toBeEnabled();
}

/** Picks a zip with "Add files" in the header's More menu. */
async function pickZip(page: Page, name: string, entries: readonly TestZipEntry[]) {
  const chooser = page.waitForEvent("filechooser");
  await more(page).click();
  await page.getByRole("menuitem", { name: "Add files" }).click();
  await (await chooser).setFiles(await zipPayload(name, entries));
}

test("should unpack a picked zip into the page's files by path, say where they came from, and publish them as one version", async ({ page }) => {
  await open(page);
  await pickZip(page, "site.zip", site);
  await expect.poll(async () => pathsShown(page)).toEqual(["about.html", "css/site.css", "js/app.js"]);
  await expect(fromZip(page)).toContainText("From site.zip: 4 files.");
  await expect(section(page).locator("[data-slot=page-files-left-out]")).toHaveText("Left out 1 hidden or system file.");
  await expect(section(page).locator("[data-slot=page-html-row]")).toContainText("This is the page itself");
  const asked = await counts(page);
  expect(asked.requests, "one request for the set").toEqual([3]);
  expect(asked.publishes, "one publish, one version").toEqual([{ added: ["css/site.css", "js/app.js", "about.html"], replaced: [], removed: [] }]);
  expect(asked.sent, "each file arrives as the zip held it").toEqual({ "css/site.css": siteCss, "js/app.js": appJs, "about.html": aboutHtml });
  await expectNoAxeViolations(section(page));

  // The zip's index.html becomes the page's HTML, as a dropped folder's does.
  await section(page).locator("[data-slot=page-html-row]").getByRole("button", { name: "Use as this page's HTML" }).click();
  await page.getByRole("dialog", { name: "Use index.html as this page's HTML?" }).getByRole("button", { name: "Use as this page's HTML" }).click();
  await more(page).click();
  await page.getByRole("menuitem", { name: "View source" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact source" })).toHaveValue(indexHtml);
});

test("should wait for the person's word when a zip replaces files the page has, with the review step passing its scan", async ({ page }) => {
  await open(page, "&files=1");
  await expect.poll(async () => pathsShown(page)).toEqual(["css/site.css", "img/logo.png"]);
  await pickZip(page, "update.zip", [{ name: "css/site.css", data: siteCss }, { name: "js/new.js", data: "1;" }]);
  await expect(batch(page).locator("[data-slot=page-batch-replaces]")).toHaveText(["Replaces css/site.css"]);
  await expect(fromZip(page)).toContainText("From update.zip: 2 files.");
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes, "nothing is replaced before the person says so").toHaveLength(0);
  await batch(page).getByRole("button", { name: "Add and replace 2 files" }).click();
  await expect(batch(page)).toHaveCount(0);
  expect((await counts(page)).publishes).toEqual([{ added: ["js/new.js"], replaced: ["css/site.css"], removed: [] }]);
});

test("should show a zip entry's bad name as a path to fix, with the same cleaned suggestion as a folder's file", async ({ page }) => {
  await open(page);
  await pickZip(page, "site.zip", [{ name: "site/css/Hero Image.css", data: siteCss }, { name: "site/ok.css", data: "p{}" }]);
  const row = batch(page).locator("[data-slot=page-batch-row]").filter({ hasText: "Hero Image.css" });
  await expect(row.getByRole("textbox", { name: "Path for Hero Image.css" })).toHaveValue("css/hero-image.css");
  await expectNoAxeViolations(section(page));
  expect((await counts(page)).publishes).toHaveLength(0);
  await row.getByRole("button", { name: "Use path" }).click();
  await expect.poll(async () => (await pathsShown(page)).sort()).toEqual(["css/hero-image.css", "ok.css"]);
});

test("should refuse a locked zip and a file that is no zip in plain words, and add nothing from them", async ({ page }) => {
  await open(page);
  await page.locator("[data-slot=add-files-input]").setInputFiles([
    await zipPayload("locked.zip", [{ name: "a.css", data: "a{}", flags: 1 }]),
    { name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("These are notes, not a zip.") },
  ]);
  await expect(notAdded(page).getByRole("alert")).toHaveText([
    "This zip is locked with a password. Unpack it and drop the folder.",
    "This file is not a zip, though its name ends in .zip.",
  ]);
  await expect(batch(page)).toHaveCount(0);
  await expect(fromZip(page)).toHaveCount(0);
  const asked = await counts(page);
  expect(asked.requests).toEqual([]);
  expect(asked.publishes).toEqual([]);
  await expectNoAxeViolations(section(page));
});

test("should show the zip being unpacked, and add nothing when Cancel stops it", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-zip-unpack", "1"); });
  await page.locator("[data-slot=add-files-input]").setInputFiles(await zipPayload("site.zip", site));
  const unpacking = section(page).locator("[data-slot=page-zip-unpacking]");
  await expect(unpacking).toContainText("Unpacking site.zip… 0%");
  await expect(unpacking.getByRole("progressbar", { name: "Unpacking site.zip" })).toBeVisible();
  await expectNoAxeViolations(section(page));
  await unpacking.getByRole("button", { name: "Cancel" }).click();
  await expect(unpacking).toHaveCount(0);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-zip-unpack"); window.dispatchEvent(new Event("fixture:release-zip-unpack")); });
  await expect(section(page).locator("[data-slot=page-html-row]")).toHaveCount(0);
  await expect(batch(page)).toHaveCount(0);
  const asked = await counts(page);
  expect(asked.requests).toEqual([]);
  expect(asked.publishes).toEqual([]);
});

test("should say the browser cannot unpack a zip, and add nothing, when it has no DecompressionStream", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, "DecompressionStream"); });
  await open(page);
  await page.locator("[data-slot=add-files-input]").setInputFiles(await zipPayload("site.zip", site));
  await expect(notAdded(page).getByRole("alert")).toHaveText("This browser cannot unpack a zip. Unpack it and drop the folder.");
  expect((await counts(page)).requests).toEqual([]);
});

test("should attach the zip itself when the person asks for the zip as it is", async ({ page }) => {
  await open(page);
  await page.locator("[data-slot=add-files-input]").setInputFiles(await zipPayload("site.zip", [{ name: "a.css", data: "a{}" }]));
  await expect.poll(async () => pathsShown(page)).toEqual(["a.css"]);
  await fromZip(page).getByRole("button", { name: "Attach the zip as it is" }).click();
  await expect(section(page).getByRole("list", { name: "Attachments" })).toContainText("site.zip");
  await expect(fromZip(page).getByRole("button")).toHaveCount(0);
});

test("should keep attaching a zip as a plain file on every other format", async ({ page }) => {
  await page.goto("/dev/editor?kind=json");
  await expect(more(page)).toBeEnabled();
  const chooser = page.waitForEvent("filechooser");
  await more(page).click();
  await page.getByRole("menuitem", { name: "Attach file" }).click();
  await (await chooser).setFiles(await zipPayload("site.zip", site));
  const list = page.getByRole("region", { name: "Attached files" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("site.zip");
  await expect(page.locator("[data-slot=page-files-from-zip]")).toHaveCount(0);
});

test.describe("dropping a zip on the page", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should unpack a dropped zip as the folder it holds", async ({ page }) => {
    await open(page);
    const zip = await buildZip(site);
    const files = [{ name: "site.zip", type: "application/zip", bytes: [...zip.bytes] }];
    const onTitle = await pointIn(page.getByRole("heading", { level: 1 }), 10);
    expect((await dragFilesAt(page, "dragover", files, onTitle)).prevented).toBe(true);
    expect((await dragFilesAt(page, "drop", files, onTitle)).prevented).toBe(true);
    await expect.poll(async () => pathsShown(page)).toEqual(["about.html", "css/site.css", "js/app.js"]);
    await expect(fromZip(page)).toContainText("From site.zip: 4 files.");
    expect((await counts(page)).publishes).toHaveLength(1);
  });
});
