import { expect, test, type Page } from "@playwright/test";

/**
 * New artifact opens a blank page in the pane, like a new document: no form
 * first. Nothing is stored until something is put in it; then it is created
 * once. The first paste or drop picks the format, and a wrong guess costs one
 * click. Checked on /dev/workspace, whose stand-in stores new artifacts in
 * the tab's sessionStorage, so a reload shows exactly what was stored.
 */

const creates = (page: Page) => page.evaluate(() => Number(window.sessionStorage.getItem("fixture:new-artifact-creates") ?? "0"));
const storedNew = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as { title: string; kind: string; content: string; files: unknown[] }[]);
const cards = (page: Page, title: string) => page.locator("[data-slot=artifact-list] li").filter({ has: page.getByText(title, { exact: true }) });
const blankPage = (page: Page) => page.getByRole("region", { name: "New artifact" });
const body = (page: Page) => page.getByRole("region", { name: "Content" });

async function openNewArtifact(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await pressNewArtifact(page);
  // The rich editor loads on demand; a person typing a title gives it that moment.
  await expect(body(page).locator('[contenteditable="true"]')).toBeVisible();
}

/** Presses New artifact once the workspace is interactive: the server-rendered button does nothing until it hydrates. */
async function pressNewArtifact(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(blankPage(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

/** Pastes plain text into the empty body, as a person's paste would arrive. */
async function pasteIntoBody(page: Page, text: string) {
  const field = body(page).locator('[contenteditable="true"]');
  await expect(field).toBeVisible();
  await field.click();
  await field.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("should open a blank page with the cursor in the title when New artifact is pressed", async ({ page }) => {
  await openNewArtifact(page);
  const title = blankPage(page).getByRole("textbox", { name: "Artifact title" });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("");
  await expect(title).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(blankPage(page).getByRole("button", { name: "Upload files" })).toBeVisible();
});

test("should reach New artifact and the title with the keyboard alone", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).focus();
    await page.keyboard.press("Enter");
    await expect(blankPage(page).getByRole("textbox", { name: "Artifact title" })).toBeFocused({ timeout: 1000 });
  }).toPass();
});

test("should leave nothing behind when the blank page is left untouched", async ({ page }) => {
  await openNewArtifact(page);
  const before = await page.locator("[data-slot=artifact-list] li").count();
  // Pressing New artifact again keeps the same blank page.
  await page.getByRole("button", { name: "New artifact" }).click();
  await expect(blankPage(page)).toHaveCount(1);
  await cards(page, "Note 2").click();
  await expect(blankPage(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  expect(await page.locator("[data-slot=artifact-list] li").count()).toBe(before);
  await expect(cards(page, "Untitled")).toHaveCount(0);
  expect(await creates(page)).toBe(0);
});

test("should store the artifact once when someone types a title and keeps writing", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("Persist once check");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First line of the body.");
  await expect(cards(page, "Persist once check")).toHaveCount(1);
  await expect(blankPage(page)).toHaveCount(0);
  await page.keyboard.type(" More words.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await creates(page)).toBe(1);

  await page.reload();
  await expect(cards(page, "Persist once check")).toHaveCount(1);
  const stored = await storedNew(page);
  expect(stored).toHaveLength(1);
  expect(stored[0]?.content).toContain("More words.");
  expect(stored[0]?.kind, "typing stays Markdown").toBe("markdown");
});

test("should show a failed create in the page and keep the text for a retry", async ({ page }) => {
  await openNewArtifact(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:fail-next-create", "1"); });
  await page.keyboard.type("Kept through a failure");
  await expect(page.getByRole("status").filter({ hasText: "Not saved." })).toBeVisible({ timeout: 15_000 });
  await expect(blankPage(page).getByRole("textbox", { name: "Artifact title" })).toHaveValue("Kept through a failure");
  expect(await creates(page)).toBe(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(cards(page, "Kept through a failure")).toHaveCount(1);
  expect(await creates(page)).toBe(1);
});

test("should paste normally when the page already has content", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.press("Enter");
  await expect(body(page).locator('[contenteditable="true"]'), "Enter in the title moves to the content").toBeFocused();
  await page.keyboard.type("Intro line. ");
  await expect(page.getByRole("button", { name: "Upload files" }), "typed content ends the blank state").toHaveCount(0);
  await pasteIntoBody(page, "name,orders\nNorth,12");
  await expect(page.locator("[data-slot=detected-format]")).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.content ?? "", { timeout: 15_000 }).toContain("North,12");
  expect((await storedNew(page))[0]?.kind).toBe("markdown");
});

test("should store a page left right after typing, once", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("Quick note");
  await cards(page, "Note 2").click();
  await expect(cards(page, "Quick note")).toHaveCount(1);
  await page.reload();
  await expect(cards(page, "Quick note")).toHaveCount(1);
  expect(await creates(page)).toBe(1);
});

test("should detect CSV from the first paste and switch the format in one click", async ({ page }) => {
  await openNewArtifact(page);
  await pasteIntoBody(page, "name,orders\nNorth,12\nSouth,9");
  const chip = page.locator("[data-slot=detected-format]");
  await expect(chip).toContainText("Detected CSV");
  await expect(page.getByRole("status").filter({ hasText: "Detected CSV" })).toHaveCount(1);
  await expect(body(page).getByRole("grid")).toBeVisible();
  await expect.poll(async () => (await storedNew(page))[0]?.kind).toBe("csv");
  expect((await storedNew(page))[0]?.content).toBe("name,orders\nNorth,12\nSouth,9");

  await chip.getByRole("button", { name: "Change" }).click();
  const dialog = page.getByRole("dialog", { name: "Format and language" });
  await dialog.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: "JSON" }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog.getByRole("alert")).toContainText("This content can’t be JSON yet");

  await dialog.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: "Text" }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(chip).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("text");
  expect(await creates(page)).toBe(1);
});

test("should keep pasted writing as Markdown and take a heading as the title", async ({ page }) => {
  await openNewArtifact(page);
  await pasteIntoBody(page, "# Launch plan\n\nShip it on Friday, with notes.");
  await expect(blankPage(page).getByRole("textbox", { name: "Artifact title" })).toHaveValue("Launch plan");
  await expect(page.locator("[data-slot=detected-format]")).toHaveCount(0);
  await expect.poll(async () => (await storedNew(page))[0]?.content).toBe("# Launch plan\n\nShip it on Friday, with notes.");
  expect((await storedNew(page))[0]?.kind).toBe("markdown");
});

test("should make a Files artifact when a file is dropped on the blank page", async ({ page }) => {
  await openNewArtifact(page);
  await body(page).evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File(["%PDF-1.4"], "Quarterly report.pdf", { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(cards(page, "Quarterly report")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Files" })).toContainText("1 attached");
  await expect.poll(async () => (await storedNew(page))[0]?.kind).toBe("file");
  expect(await creates(page)).toBe(1);
});

/** Holds a file over an element, as a person dragging it from the desktop would. */
async function dragOver(target: ReturnType<Page["locator"]>) {
  await target.evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File(["%PDF-1.4"], "Held.pdf", { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
}

/** Drops files onto an element, as a person dragging them from the desktop would. */
async function dropFiles(target: ReturnType<Page["locator"]>, names: readonly string[]) {
  await target.evaluate((element, files) => {
    const data = new DataTransfer();
    for (const name of files) data.items.add(new File(["%PDF-1.4"], name, { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [...names]);
}

test("should add later files through the artifact's Files section once a drop made it", async ({ page }) => {
  await openNewArtifact(page);
  await dropFiles(body(page), ["First.pdf"]);
  const files = page.getByRole("region", { name: "Files" });
  await expect(files).toContainText("1 attached");
  // The blank page's own uploader is gone: the Files section is the one place to add files now.
  await expect(page.getByText("Drop files here, or")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);

  // Held while it uploads: the Files section shows it, and the blank page's own uploader stays gone.
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-uploads", "1"); });
  await dropFiles(files.getByText("Drop files here, or"), ["Second.pdf"]);
  await expect(files.getByText("Second.pdf")).toBeVisible();
  await expect(page.getByText("Drop files here, or")).toHaveCount(1);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-uploads"); window.dispatchEvent(new Event("fixture:release-uploads")); });
  await expect(files).toContainText("2 attached");

  // A drop on the section but outside its drop box still lands: the page takes it.
  await dropFiles(files.getByRole("heading", { name: "Files" }), ["Third.pdf"]);
  await expect(files).toContainText("3 attached");
  await expect.poll(async () => (await storedNew(page))[0]?.files.length).toBe(3);
  expect((await storedNew(page))[0]?.kind).toBe("file");
  expect(await creates(page)).toBe(1);
});

test("should take a drop on the blank page's own drop box while files upload", async ({ page }) => {
  await openNewArtifact(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-uploads", "1"); });
  await dropFiles(body(page), ["First.pdf"]);
  const box = blankPage(page).getByText("Drop files here, or");
  // Held over the pane, the page shows its hint; over the box, the box takes over, and the hint goes.
  await dragOver(body(page));
  await expect(page.locator("[data-slot=drop-hint]")).toHaveCount(1);
  await dragOver(box);
  await expect(page.locator("[data-slot=drop-hint]")).toHaveCount(0);
  await dropFiles(box, ["Second.pdf"]);
  await expect(page.locator("[data-slot=drop-hint]")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Uploads" }).getByRole("listitem")).toHaveCount(2);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-uploads"); window.dispatchEvent(new Event("fixture:release-uploads")); });
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(2);
  expect((await storedNew(page))[0]?.kind).toBe("file");
  expect(await creates(page)).toBe(1);
});

test("should attach a file dropped after a title was already stored", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("Title first");
  await expect(cards(page, "Title first")).toHaveCount(1);
  await dropFiles(body(page), ["Later.pdf"]);
  await expect(page.getByRole("region", { name: "Files" })).toContainText("1 attached");
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("file");
  const [stored] = await storedNew(page);
  expect(stored?.title, "the typed title stays").toBe("Title first");
  expect(stored?.files).toHaveLength(1);
  expect(await creates(page)).toBe(1);
});

test("should upload a code file dropped while files are on their way, and keep what was typed", async ({ page }) => {
  await openNewArtifact(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-uploads", "1"); });
  await dropFiles(body(page), ["First.pdf"]);
  await expect(page.getByText("First.pdf")).toBeVisible();
  const field = body(page).locator('[contenteditable="true"]');
  await field.click();
  await page.keyboard.type("Typed while it uploads");
  await body(page).evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File(["const a = 1;"], "notes.ts", { type: "text/plain" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("notes.ts")).toBeVisible();
  await expect(field).toContainText("Typed while it uploads");
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-uploads"); window.dispatchEvent(new Event("fixture:release-uploads")); });

  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(2);
  const [stored] = await storedNew(page);
  expect(stored?.kind, "typed writing keeps the page a document").toBe("markdown");
  expect(stored?.content).toContain("Typed while it uploads");
  expect(await creates(page)).toBe(1);
});

test("should attach a file dropped on a page that already has writing, and keep the writing", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("Notes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Written first");
  await expect(cards(page, "Notes")).toHaveCount(1);
  // Held while it uploads: its progress shows, with no second drop box beside the Files section.
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-uploads", "1"); });
  await dropFiles(body(page), ["Screenshot.pdf"]);
  await expect(page.getByRole("list", { name: "Uploads" }).getByText("Screenshot.pdf")).toBeVisible();
  await expect(page.getByText("Drop files here, or")).toHaveCount(0);
  await page.evaluate(() => { window.sessionStorage.removeItem("fixture:hold-uploads"); window.dispatchEvent(new Event("fixture:release-uploads")); });
  await expect(page.getByRole("region", { name: "Files" })).toContainText("1 attached");
  await expect(body(page)).toContainText("Written first");
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await storedNew(page))[0]?.content, { timeout: 15_000 }).toContain("Written first");
  const [stored] = await storedNew(page);
  expect(stored?.kind).toBe("markdown");
  expect(await creates(page)).toBe(1);
});

test("should attach a file dropped on a page whose format is not Markdown, and keep its content", async ({ page }) => {
  await openNewArtifact(page);
  await pasteIntoBody(page, "name,value\nAda,1\nBo,2");
  await expect.poll(async () => (await storedNew(page))[0]?.kind, { timeout: 15_000 }).toBe("csv");
  await dropFiles(body(page), ["Source.pdf"]);
  await expect.poll(async () => (await storedNew(page))[0]?.files.length, { timeout: 15_000 }).toBe(1);
  await expect(page.getByRole("region", { name: "Files" })).toContainText("1 attached");
  const [stored] = await storedNew(page);
  expect(stored?.kind).toBe("csv");
  expect(stored?.content).toBe("name,value\nAda,1\nBo,2");
  expect(await creates(page)).toBe(1);
});

test("should move Format and language into the More menu of a stored artifact", async ({ page }) => {
  await page.goto("/dev/workspace");
  await cards(page, "Note 2").click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Format and language" }).click();
  await expect(page.getByRole("dialog", { name: "Format and language" })).toBeVisible();
});

test("should leave an untouched blank page for the artifact a notification opens", async ({ page }) => {
  await openNewArtifact(page);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog").getByRole("link").filter({ hasText: "mentioned you on Long markdown fixture" }).click();
  await expect(page.getByRole("heading", { name: "Comments on Long markdown fixture" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Edit Long markdown fixture" })).toBeVisible();
  await expect(blankPage(page)).toHaveCount(0);
  expect(await creates(page), "the untouched page stored nothing").toBe(0);
});

test("should reopen an artifact made on a blank page with its latest body after New artifact was pressed again", async ({ page }) => {
  await openNewArtifact(page);
  await page.keyboard.type("Kept copy");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First body");
  await expect.poll(async () => (await storedNew(page))[0]?.content, { timeout: 15_000 }).toBe("First body");

  // Edited on its own page after the blank page let go of it.
  await cards(page, "Long ui fixture").click();
  await expect(page.getByRole("region", { name: "Edit Long ui fixture" })).toBeVisible();
  await cards(page, "Kept copy").click();
  const own = page.getByRole("region", { name: "Edit Kept copy" }).locator('[contenteditable="true"]');
  await own.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more");
  await expect.poll(async () => (await storedNew(page))[0]?.content, { timeout: 15_000 }).toBe("First body and more");

  // New artifact again, left untouched, then the artifact once more: it opens on the latest body.
  await pressNewArtifact(page);
  await cards(page, "Kept copy").click();
  await expect(own).toContainText("First body and more");
  expect(await creates(page)).toBe(1);
});
