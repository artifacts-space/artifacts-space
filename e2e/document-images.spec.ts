import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * Images in a document, on the media fixture's gallery document
 * (/dev/editor?kind=media&doc=gallery; `&as=reader` is the read view):
 * three images and a file card, with the files a saved artifact lists,
 * their stored pixel sizes included. An image opens larger in place, for
 * readers and editors; Back closes it and its address is a link. An image
 * whose size is stored keeps its place before it loads. In the editor an
 * image resizes from both edges and the corners, a file's card shows its
 * type and size, and Cancel stops an upload's request.
 */

const dusk = "00000000-0000-4000-8000-0000000000a1";
const mark = "00000000-0000-4000-8000-0000000000a3";
const misstated = "00000000-0000-4000-8000-0000000000a4";

const readerUrl = "/dev/editor?kind=media&doc=gallery&as=reader";
const editorUrl = "/dev/editor?kind=media&doc=gallery";

const viewer = (page: Page) => page.locator("[data-image-viewer]");
const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");
const hash = (page: Page) => page.evaluate(() => window.location.hash);

async function openReader(page: Page, fragment = "") {
  await page.goto(`${readerUrl}${fragment}`);
  await expect(page.locator('[data-media-state="ready"]')).toHaveCount(3);
}

async function openEditor(page: Page) {
  await page.goto(editorUrl);
  await expect(editor(page).getByRole("heading", { name: "Gallery fixture" })).toBeVisible();
  await expect(editor(page).locator('[data-media-state="ready"]')).toHaveCount(3);
}

/** The box an element is drawn in, in whole pixels. */
async function boxOf(target: Locator): Promise<{ width: number; height: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error("Not drawn");
  return { width: Math.round(box.width), height: Math.round(box.height) };
}

test.describe("for a reader", () => {
  test("should open an image larger in place with a click, over the whole window, and close it with Back", async ({ page }) => {
    await openReader(page);
    await page.getByRole("img", { name: "Dusk over the hills" }).click();

    const dialog = viewer(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Dusk over the hills" })).toBeVisible();
    await expect(dialog.getByText("1 of 3")).toBeVisible();
    await expect(dialog.getByText("A preset caption")).toBeVisible();
    // The address the page already loaded, at the size it already knows: nothing new is asked for, and nothing moves.
    const shown = dialog.getByRole("img", { name: "Dusk over the hills" });
    await expect(shown).toHaveAttribute("src", /\/hero-dusk\.webp$/);
    await expect(shown).toHaveAttribute("width", "2880");
    await expect(shown).toHaveAttribute("height", "2160");
    expect(await boxOf(dialog)).toEqual(page.viewportSize());
    expect(await hash(page)).toBe(`#block-file=${dusk}&view=1`);

    await page.goBack();
    await expect(dialog).toHaveCount(0);
    expect(await hash(page)).toBe("");
    await expect(page.getByRole("heading", { name: "Gallery fixture" })).toBeVisible();

    await page.goForward();
    await expect(dialog.getByRole("heading", { name: "Dusk over the hills" })).toBeVisible();
  });

  test("should step through the document's images with the arrow keys and the buttons, and close them all with one Back", async ({ page }) => {
    await openReader(page);
    await page.getByRole("img", { name: "Dusk over the hills" }).click();
    const dialog = viewer(page);
    await expect(dialog.getByRole("button", { name: "Previous image" })).toBeDisabled();

    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("heading", { name: "The site's mark" })).toBeVisible();
    await expect(dialog.getByText("2 of 3")).toBeVisible();
    expect(await hash(page)).toBe(`#block-file=${mark}&view=1`);

    await dialog.getByRole("button", { name: "Next image" }).click();
    // An image without alt text is named "Image"; its caption still shows.
    await expect(dialog.getByRole("heading", { name: "Image" })).toBeVisible();
    await expect(dialog.getByText("3 of 3")).toBeVisible();
    await expect(dialog.getByText("A picture without alt text")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Next image" })).toBeDisabled();
    expect(await hash(page)).toBe(`#block-file=${misstated}&view=1`);

    await page.keyboard.press("ArrowLeft");
    await expect(dialog.getByText("2 of 3")).toBeVisible();

    // Previous and Next add no history entries.
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    expect(await hash(page)).toBe("");
    await expect(page.getByRole("heading", { name: "Gallery fixture" })).toBeVisible();
  });

  test("should open from the keyboard, close with Escape, and put the focus back on the image's control", async ({ page }) => {
    await openReader(page);
    const control = page.getByRole("button", { name: "Open larger" }).nth(1);
    await control.focus();
    await page.keyboard.press("Enter");

    const dialog = viewer(page);
    await expect(dialog.getByRole("heading", { name: "The site's mark" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(dialog.getByLabel("Download")).toHaveAttribute("href", "/artifacts-space-icon.png");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(control).toBeFocused();
    await expect.poll(() => hash(page)).toBe("");
  });

  test("should open the image its address names when someone arrives on it, and keep the block's link when it is closed", async ({ page }) => {
    await openReader(page, `#block-file=${mark}&view=1`);
    const dialog = viewer(page);
    await expect(dialog.getByRole("heading", { name: "The site's mark" })).toBeVisible();
    await expect(dialog.getByText("2 of 3")).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    // The reader stays on the page they arrived on, at the image's block.
    expect(await hash(page)).toBe(`#block-file=${mark}`);
    await expect(page.getByRole("img", { name: "The site's mark" })).toBeInViewport();
  });

  test("should land on the image's block, not open it, when the link is to the block alone", async ({ page }) => {
    await openReader(page, `#block-file=${mark}`);
    await expect(page.getByRole("img", { name: "The site's mark" })).toBeInViewport();
    await expect(viewer(page)).toHaveCount(0);
  });

  test("should pass an accessibility scan with the control on an image and with the viewer open", async ({ page }) => {
    await openReader(page);
    await expectNoAxeViolations(page.locator('figure[data-media-kind="image"]').first());

    await page.getByRole("button", { name: "Open larger" }).first().click();
    const dialog = viewer(page);
    await expect(dialog.getByText("1 of 3")).toBeVisible();
    await expectNoAxeViolations(dialog);
    await expect(dialog).toMatchAriaSnapshot(`
      - dialog "Dusk over the hills":
        - heading "Dusk over the hills" [level=2]
        - paragraph: 1 of 3
        - button "Download"
        - button "Close"
        - button "Previous image" [disabled]
        - img "Dusk over the hills"
        - button "Next image"
        - paragraph: A preset caption
    `);
  });

  test("should keep an image's place before the picture arrives when its size is stored", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/hero-dusk.webp", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(readerUrl);
    const image = page.getByRole("img", { name: "Dusk over the hills" });
    await expect(image).toHaveAttribute("width", "2880");
    await expect(page.locator('[data-media-state="loading"]').first()).toBeVisible();

    // Half the column wide, at the picture's own 4:3, with nothing standing in for it.
    const before = await boxOf(image);
    expect(before.width).toBeGreaterThan(100);
    expect(Math.abs(before.height - before.width * 0.75)).toBeLessThanOrEqual(1);
    const below = page.getByText("Middle paragraph.");
    const belowBefore = await below.boundingBox();

    release();
    await expect(page.locator('[data-media-state="ready"]')).toHaveCount(3);
    expect(await boxOf(image)).toEqual(before);
    expect((await below.boundingBox())?.y).toBe(belowBefore?.y);
  });

  test("should show a picture at its own shape when the stored size is not the picture's", async ({ page }) => {
    await openReader(page);
    // The list says 100 by 100; the picture is 2880 by 2160.
    const image = page.locator(`img[data-image-view="${misstated}"]`);
    await expect(image).not.toHaveAttribute("width", "100");
    const box = await boxOf(image);
    expect(box.width).toBeGreaterThan(200);
    expect(Math.abs(box.height - box.width * 0.75)).toBeLessThanOrEqual(1);
  });
});

test.describe("in the editor", () => {
  test("should select an image with a click, and open it larger with a double-click or from its toolbar", async ({ page }) => {
    await openEditor(page);
    const image = editor(page).getByRole("img", { name: "Dusk over the hills" });
    await image.click();
    const toolbar = editor(page).getByRole("toolbar", { name: "Media options" });
    await expect(toolbar).toBeVisible();
    await expect(viewer(page)).toHaveCount(0);

    await image.dblclick();
    const dialog = viewer(page);
    await expect(dialog.getByRole("heading", { name: "Dusk over the hills" })).toBeVisible();
    await expect(dialog.getByText("1 of 3")).toBeVisible();
    // It stays open: the block's view is not rebuilt under it.
    await page.waitForTimeout(600);
    await expect(dialog.getByText("A preset caption")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await image.click();
    await toolbar.getByRole("button", { name: "Open larger" }).click();
    await expect(dialog.getByRole("heading", { name: "Dusk over the hills" })).toBeVisible();
    await expectNoAxeViolations(dialog);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    // Opening and closing changed nothing in the document.
    await expect(savedMarkdown(page)).toContainText(`![Dusk over the hills](/api/files/${dusk}#width=50 "A preset caption")`);
  });

  test("should keep the viewer open when the document also holds a code block", async ({ page }) => {
    await openEditor(page);
    await editor(page).getByText("End paragraph.").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("```ts ");
    await page.keyboard.type("const answer = 42;");
    await expect(editor(page).locator("[data-code-toolbar]")).toHaveCount(1);
    const image = editor(page).getByRole("img", { name: "Dusk over the hills" });
    const block = await image.elementHandle();
    await image.dblclick();
    const dialog = viewer(page);
    await expect(dialog.getByRole("heading", { name: "Dusk over the hills" })).toBeVisible();
    // A code block's Copy once kept a live region in the text: the viewer's dialog then made the editor draw every block again, and the new image block opened the viewer again from the address, without end (issue #226).
    expect(await block.evaluate((element) => element.isConnected)).toBe(true);
    await expect(dialog.getByText("A preset caption")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await hash(page)).toBe("");
  });

  test("should resize an image from the left edge, from a corner, and with the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "Phones always use the full column, so the handles are not drawn there.");
    await openEditor(page);
    const image = editor(page).getByRole("img", { name: "Dusk over the hills" });
    await image.click();
    const column = await editor(page).evaluate((element) => element.clientWidth);
    const widthIn = async () => Number(/a1#width=(\d+)/.exec(await savedMarkdown(page).innerText())?.[1]);
    const drag = async (handle: string, dx: number, dy: number) => {
      const box = await editor(page).locator(`[data-media-resize="${handle}"]`).first().boundingBox();
      if (!box) throw new Error(`No ${handle} handle`);
      const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
      await page.mouse.up();
    };

    // The left edge widens the image as the pointer moves left.
    const drawn = (await boxOf(image)).width;
    await drag("left", -80, 0);
    const widened = Math.round(((drawn + 80) / column) * 100);
    await expect.poll(widthIn).toBe(widened);

    // A corner follows the pointer down, at the picture's 4:3.
    const wider = (await boxOf(image)).width;
    await drag("bottom-right", 0, 60);
    await expect.poll(widthIn).toBe(Math.round(((wider + 80) / column) * 100));

    // The edges are sliders: an arrow moves the edge five percent the way it points.
    const before = await widthIn();
    const edge = editor(page).getByRole("slider", { name: "Resize from the right edge" }).first();
    await edge.focus();
    await expect(edge).toHaveAttribute("aria-valuenow", String(before));
    await page.keyboard.press("ArrowLeft");
    await expect.poll(widthIn).toBe(before - 5);
    await editor(page).getByRole("slider", { name: "Resize from the left edge" }).first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(widthIn).toBe(before);
    await expectNoAxeViolations(editor(page).locator('[data-media-block="image"]').first());
  });

  test("should show a file's type and size on its card", async ({ page }) => {
    await openEditor(page);
    const card = editor(page).getByRole("link", { name: /handbook\.zip/ });
    await expect(card).toContainText("1.2 MB");
    await expect(card).toContainText(/ZIP/i);
  });

  test("should keep a stored image's place in the editor before the picture arrives", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/hero-dusk.webp", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(editorUrl);
    const image = editor(page).getByRole("img", { name: "Dusk over the hills" });
    await expect(image).toHaveAttribute("width", "2880");
    const before = await boxOf(image);
    expect(before.width).toBeGreaterThan(100);
    expect(Math.abs(before.height - before.width * 0.75)).toBeLessThanOrEqual(1);
    release();
    await expect(editor(page).locator('[data-media-state="ready"]')).toHaveCount(3);
    expect(await boxOf(image)).toEqual(before);
  });

  test("should stop the request and take the block out when an upload is cancelled", async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => { window.sessionStorage.setItem("fixture:hold-media-uploads", "1"); });
    await editor(page).getByText("End paragraph.").click();
    await editor(page).evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "notes.pdf", { type: "application/pdf" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    const uploading = editor(page).getByRole("group", { name: "Uploading notes.pdf" });
    await expect(uploading.getByText("Uploading… 50%")).toBeVisible();

    await uploading.getByRole("button", { name: "Cancel the upload of notes.pdf" }).click();
    await expect(uploading).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.fixtureStoppedUploads ?? 0)).toBe(1);
    await expect(savedMarkdown(page)).not.toContainText("notes.pdf");
  });
});
