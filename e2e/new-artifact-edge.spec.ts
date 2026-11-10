import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The New artifact page's harder cases, on /dev/workspace: files removed or
 * kept around a refused create or attach, leaving while files are on their
 * way, a rich paste, and starting a table directly. The fixture stands in
 * for the server, refuses what it refuses, and records every upload it
 * deletes, so a check can prove that no kept file was deleted.
 */

const creates = (page: Page) => page.evaluate(() => Number(window.sessionStorage.getItem("fixture:new-artifact-creates") ?? "0"));
const storedNew = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as { title: string; kind: string; content: string; files: { id: string }[] }[]);
const discarded = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:discarded") ?? "[]") as string[]);
const setFlag = (page: Page, key: string, value: string) => page.evaluate(([name, flag]) => { window.sessionStorage.setItem(name, flag); }, [key, value] as const);
const fire = (page: Page, name: string) => page.evaluate((event) => { window.dispatchEvent(new Event(event)); }, name);
const cards = (page: Page, title: string) => page.locator("[data-slot=artifact-list] li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const blankPage = (page: Page) => page.getByRole("region", { name: "New artifact" });
const body = (page: Page) => page.getByRole("region", { name: "Content" });
const notSaved = (page: Page) => page.getByRole("status").filter({ hasText: "Not saved." });
const attachProblem = "The files could not be added. Drop them again to try once more.";

async function openNewArtifact(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(blankPage(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(body(page).locator('[contenteditable="true"]')).toBeVisible();
}

/** Drops files onto an element, as a person dragging them from the desktop would. */
async function dropFiles(target: Locator, names: readonly string[]) {
  await target.evaluate((element, files) => {
    const data = new DataTransfer();
    for (const name of files) data.items.add(new File(["%PDF-1.4"], name, { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [...names]);
}

/** Types a title, which stores the page, and waits for it in the list. */
async function storeWithTitle(page: Page, title: string) {
  await page.keyboard.type(title);
  await expect(cards(page, title)).toHaveCount(1);
}

test("should create the page without a file that was removed after a refused create", async ({ page }) => {
  await openNewArtifact(page);
  // Every create is refused until the file is gone, including the save that runs as focus leaves for Remove.
  await setFlag(page, "fixture:fail-next-create", "always");
  await dropFiles(body(page), ["Draft.pdf"]);
  await expect(notSaved(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Remove Draft.pdf" }).click();
  await expect(page.getByRole("list", { name: "Uploads" })).toHaveCount(0);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:fail-next-create"); });

  // The page is blank again, not an empty Files artifact, and writing in it creates it.
  const field = body(page).locator('[contenteditable="true"]');
  await expect(field).toBeVisible();
  await field.click();
  await page.keyboard.type("Notes after all");
  await expect.poll(async () => (await storedNew(page))[0]?.content, { timeout: 15_000 }).toBe("Notes after all");
  const [stored] = await storedNew(page);
  expect(stored?.kind).toBe("markdown");
  expect(stored?.files).toHaveLength(0);
  expect(await creates(page)).toBe(1);
  await expect(page.getByText(/files_request_upload|file ids are unknown|could not be added/)).toHaveCount(0);
});

test("should keep a file whose attach is still on its way when the page is left", async ({ page }) => {
  await openNewArtifact(page);
  await storeWithTitle(page, "Held attach");
  await setFlag(page, "fixture:hold-attach", "1");
  await dropFiles(body(page), ["Kept.pdf"]);
  await expect(page.getByRole("list", { name: "Uploads" }).getByText("Kept.pdf")).toBeVisible();
  await cards(page, "Long ui fixture").click();
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
  await fire(page, "fixture:release-attach");
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
  expect(await discarded(page)).toEqual([]);
});

test("should keep a file whose attach answer was lost, even after leaving the page", async ({ page }) => {
  await openNewArtifact(page);
  await storeWithTitle(page, "Lost answer");
  await setFlag(page, "fixture:next-attach", "lose");
  await dropFiles(body(page), ["Maybe.pdf"]);
  await expect(page.getByText(attachProblem, { exact: true })).toBeVisible();
  await cards(page, "Long ui fixture").click();
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
  expect((await storedNew(page))[0]?.files).toHaveLength(1);
  expect(await discarded(page)).toEqual([]);
});

test("should delete a file whose attach was refused, and say so", async ({ page }) => {
  await openNewArtifact(page);
  await storeWithTitle(page, "Refused attach");
  await setFlag(page, "fixture:next-attach", "refuse");
  await dropFiles(body(page), ["Refused.pdf"]);
  await expect(page.getByText(attachProblem, { exact: true })).toBeVisible();
  await expect.poll(async () => (await discarded(page)).length).toBe(1);
  expect((await storedNew(page))[0]?.files).toHaveLength(0);
});

test("should ask before the tab closes while a dropped file is still uploading", async ({ page }) => {
  await openNewArtifact(page);
  await setFlag(page, "fixture:hold-uploads", "1");
  await dropFiles(body(page), ["Slow.pdf"]);
  await expect(page.getByText("Slow.pdf")).toBeVisible();
  const dialog = page.waitForEvent("dialog");
  void page.reload().catch(() => undefined);
  const asked = await dialog;
  expect(asked.type()).toBe("beforeunload");
  await asked.dismiss();
});

test("should store the page with its file when the last save on leaving goes through after a refused create", async ({ page }) => {
  await openNewArtifact(page);
  await setFlag(page, "fixture:fail-next-create", "1");
  await dropFiles(body(page), ["Report.pdf"]);
  await expect(notSaved(page)).toBeVisible({ timeout: 15_000 });
  await cards(page, "Long ui fixture").click();
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
  expect(await discarded(page)).toEqual([]);
  expect(await creates(page)).toBe(1);
});

test("should delete the files a refused create carried once the page is left and the last try is refused too", async ({ page }) => {
  await openNewArtifact(page);
  await setFlag(page, "fixture:fail-next-create", "always");
  await dropFiles(body(page), ["Orphan.pdf"]);
  await expect(notSaved(page)).toBeVisible({ timeout: 15_000 });
  await cards(page, "Long ui fixture").click();
  await expect.poll(async () => (await discarded(page)).length, { timeout: 15_000 }).toBe(1);
  expect(await storedNew(page)).toHaveLength(0);
});

test("should keep headings, links, bold, and lists when the first paste is rich text", async ({ page }) => {
  await openNewArtifact(page);
  const field = body(page).locator('[contenteditable="true"]');
  await field.click();
  await field.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/html", '<h2>Plan</h2><p>Read <a href="https://example.com/docs">the docs</a> and <strong>ship</strong>.</p><ul><li>One</li><li>Two</li></ul>');
    data.setData("text/plain", "Plan\nRead the docs and ship.\nOne\nTwo");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(field.locator("h2")).toHaveText("Plan");
  await expect(field.locator('a[href="https://example.com/docs"]')).toHaveText("the docs");
  await expect(field.locator("strong")).toHaveText("ship");
  await expect(field.locator("li")).toHaveCount(2);
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("## Plan");
  const content = (await storedNew(page))[0]?.content ?? "";
  expect(content).toContain("[the docs](https://example.com/docs)");
  expect(content).toContain("**ship**");
  expect(content).toMatch(/^[-*] One$/m);
});

test("should start a table directly when an empty page is switched to CSV", async ({ page }) => {
  await openNewArtifact(page);
  await blankPage(page).getByRole("button", { name: "Format" }).click();
  const dialog = page.getByRole("dialog", { name: "Format and language" });
  await dialog.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: "CSV" }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(body(page).getByRole("grid")).toBeVisible();
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("csv");
  expect(await creates(page)).toBe(1);
});

test("should switch an empty page to Files and back to Markdown before it is stored", async ({ page }) => {
  await openNewArtifact(page);
  const toolbar = blankPage(page).getByRole("button", { name: "Format" });
  const dialog = page.getByRole("dialog", { name: "Format and language" });
  for (const format of ["Files", "Markdown"]) {
    await toolbar.click();
    await dialog.getByRole("combobox", { name: "Format" }).click();
    await page.getByRole("option", { name: format, exact: true }).click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(body(page).locator('[contenteditable="true"]')).toBeVisible();
  await page.getByRole("textbox", { name: "Artifact title" }).fill("Back to writing");
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("markdown");
  expect(await creates(page)).toBe(1);
});
