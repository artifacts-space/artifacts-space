import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { readColors } from "./support/colors";

/**
 * An artifact in the /app pane reads like a document page: the toolbar
 * stays, and the title block (icon, title, summary, chips, meta line) is
 * part of the page. It scrolls away with the body and sits on the body's
 * surface, in the artifact's theme. Only what a person must not miss stays
 * in view: a notice that arrives, and the meta line while a save has not
 * gone through. Checked on /dev/workspace, the real workspace without a
 * database, where Note 9 uses the Ocean theme and Note 10 has none.
 */

const slot = (page: Page, name: string) => page.locator(`[data-slot=${name}]`);
const title = (page: Page) => page.getByRole("textbox", { name: "Artifact title" });
const history = (page: Page) => page.getByRole("button", { name: "History" });

/** Scrolls the page of the pane to its end: the pane's scroll box from md up, the window on a phone. Returns how far it went. */
function scrollPaneToEnd(page: Page) {
  return slot(page, "detail-outer").evaluate((outer) => {
    outer.scrollTop = outer.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
    return outer.scrollTop + window.scrollY;
  });
}

async function openArtifact(page: Page, publicId: string, name: string) {
  await page.goto(`/dev/workspace?artifact=${publicId}`);
  const editor = page.getByRole("region", { name: `Edit ${name}` });
  await expect(editor).toBeVisible();
  return editor;
}

/** The color a reader sees behind an element. */
const surfaceOf = async (locator: Locator) => (await readColors(locator)).background;

for (const size of [{ width: 1280, height: 800 }, { width: 1280, height: 640 }, { width: 820, height: 1180 }]) {
  test(`should scroll the title block away with the body while the toolbar stays, at ${String(size.width)} by ${String(size.height)}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone scrolls the window; checked below");
    await page.setViewportSize(size);
    await openArtifact(page, "fixtureworkspace0000ui", "Long ui fixture");
    await expect(title(page)).toBeInViewport();
    const toolbarTop = (await history(page).boundingBox())?.y;

    expect(await scrollPaneToEnd(page), "the page under the toolbar scrolls").toBeGreaterThan(1000);
    await expect(title(page), "the title scrolled away").not.toBeInViewport();
    await expect(slot(page, "save-status"), "the meta line scrolled away with it").not.toBeInViewport();
    await expect(history(page), "the toolbar stays").toBeInViewport();
    expect((await history(page).boundingBox())?.y, "the toolbar did not move").toBe(toolbarTop);
    expect(await page.evaluate(() => window.scrollY), "the window itself does not scroll").toBe(0);

    // One scroll box holds the title block and the body: the body never scrolls by itself.
    const boxes = await page.evaluate(() => ["detail-outer", "detail-body"].map((name) => {
      const element = document.querySelector(`[data-slot=${name}]`);
      return element ? getComputedStyle(element).overflowY : "missing";
    }));
    expect(boxes).toEqual(["auto", "visible"]);
  });
}

test("should scroll the page of the pane from the keyboard, title block and all, when a view with no field has the focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone scrolls the window");
  await page.setViewportSize({ width: 1280, height: 800 });
  await openArtifact(page, "fixtureworkspace0json", "Long json fixture");
  const pane = slot(page, "detail-outer");
  // A rendered view has no field, so the Content region is the tab stop; the keys scroll the page it is part of.
  const content = page.getByRole("region", { name: "Content" });
  await expect(content).toHaveAttribute("tabindex", "0");
  await content.focus();
  await expect(content).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press("End");
  await expect.poll(() => pane.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(title(page)).not.toBeInViewport();
  await page.keyboard.press("Home");
  await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(title(page), "Home brings the title block back").toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("should scroll the title block away with the page on a phone while the toolbar stays", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the pane's own scroll box is checked above");
  await openArtifact(page, "fixtureworkspace0000ui", "Long ui fixture");
  expect(await scrollPaneToEnd(page)).toBeGreaterThan(1000);
  await expect(title(page)).not.toBeInViewport();
  await expect(history(page)).toBeInViewport();
});

test("should put the title block of a themed artifact on the body's surface, in the theme's ink", async ({ page }) => {
  const editor = await openArtifact(page, "fixtureworkspacenote08", "Note 9");
  const body = editor.locator("[data-content-theme]").getByText(/The preview wears/);
  await expect(body).toBeVisible();
  const page9 = await readColors(body);
  const toolbar = await surfaceOf(history(page));
  expect(page9.background, "Note 9 is themed: its page color is not the app's").not.toBe(toolbar);

  const rows = {
    title: title(page),
    summary: page.getByRole("textbox", { name: "Artifact summary" }),
    chips: editor.getByRole("button", { name: /^(Add to project|Project: )/ }),
    "meta line": slot(page, "save-status").getByText(/chars/),
  };
  for (const [name, row] of Object.entries(rows)) {
    const colors = await readColors(row);
    expect(colors.background, `the ${name} sits on the body's surface`).toBe(page9.background);
    expect(colors.contrast, `the ${name} stays readable on it`).toBeGreaterThanOrEqual(4.5);
  }
  expect((await readColors(title(page))).text, "the title takes the theme's ink").toBe(page9.text);
  expect(await surfaceOf(history(page)), "the toolbar keeps the app's look").toBe(toolbar);
});

test("should keep the title block of an unthemed artifact on the same surface as its body", async ({ page }) => {
  const editor = await openArtifact(page, "fixtureworkspacenote09", "Note 10");
  const body = editor.locator("[data-content-theme]").getByText(/^Note 10\.$/);
  await expect(body).toBeVisible();
  expect(await surfaceOf(title(page))).toBe(await surfaceOf(body));
  expect(await surfaceOf(slot(page, "save-status").getByText(/chars/))).toBe(await surfaceOf(body));
});

test("should put a read-only shared page's title block on its body's surface and scroll it with the page", async ({ page, isMobile }) => {
  await page.goto("/dev/workspace?artifact=fixtureteammatetagged1");
  const heading = page.getByRole("heading", { name: "Teammate's plan", level: 2 });
  await expect(heading).toBeVisible();
  const body = slot(page, "detail-body").locator("[data-content-theme]");
  expect(await surfaceOf(heading)).toBe(await surfaceOf(body));
  expect(await surfaceOf(slot(page, "panel-meta"))).toBe(await surfaceOf(body));
  if (isMobile) return;
  expect(await slot(page, "detail-outer").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  expect(await slot(page, "detail-body").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
});

test.describe("what stays in view", () => {
  test.skip(({ isMobile }) => isMobile, "a phone scrolls the window under a toolbar that sticks; nothing pins there");

  test("should keep the meta line in view while a save is held back, and let it scroll again once it is fixed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const editor = await openArtifact(page, "fixtureworkspace0json", "Long json fixture");
    const status = slot(page, "save-status");
    const pinned = slot(page, "detail-status");
    await editor.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "View source" }).click();
    const source = editor.getByRole("textbox", { name: "Artifact source" });
    await expect(source).toBeVisible();
    await expect(pinned).toHaveAttribute("data-pinned", "false");
    const written = await source.inputValue();

    // JSON that does not parse is never sent: the save is held back, and the meta line says why.
    await source.fill(`oops ${written}`);
    await expect(pinned).toHaveAttribute("data-pinned", "true");
    const words = status.getByRole("status");
    await expect(words).not.toHaveText(/^(Saving…|Saved)?$/);

    expect(await scrollPaneToEnd(page)).toBeGreaterThan(1000);
    await expect(title(page), "the title scrolled away").not.toBeInViewport();
    await expect(status, "the meta line stays, with why it is not saved").toBeInViewport({ ratio: 1 });
    const [statusBox, paneBox] = await Promise.all([status.boundingBox(), slot(page, "detail-outer").boundingBox()]);
    expect(Math.abs((statusBox?.y ?? -1) - (paneBox?.y ?? 0)), "it sits at the top of the pane").toBeLessThanOrEqual(1);
    // Opaque: the page scrolls under it, not through it.
    expect(await pinned.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toMatch(/rgba?\(0, 0, 0, 0\)|transparent|\/ 0\)/);

    // Put right again, nothing is held, and the meta line scrolls with the page as before.
    await source.fill(written);
    await expect(pinned).toHaveAttribute("data-pinned", "false");
    expect(await scrollPaneToEnd(page)).toBeGreaterThan(1000);
    await expect(status).not.toBeInViewport();
  });

  test("should keep a notice that arrives in view while the title block is scrolled away", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/workspace?artifact=fixtureworkspace0000ui&catchup=agent");
    const editor = page.getByRole("region", { name: "Edit Long ui fixture" });
    await expect(editor).toBeVisible();
    expect(await scrollPaneToEnd(page)).toBeGreaterThan(1000);
    await expect(title(page)).not.toBeInViewport();

    // An agent's save arrives when the tab comes back: come back until the editor has taken it.
    const notice = editor.locator("[data-slot=catch-up-notice]");
    await expect(async () => {
      await page.evaluate(() => { window.dispatchEvent(new Event("focus")); });
      await expect(notice).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(notice, "the notice is in view, at the top of the pane").toBeInViewport({ ratio: 1 });
    await expect(title(page), "the title block did not come back with it").not.toBeInViewport();
    const [noticeTop, paneTop] = await Promise.all([notice.boundingBox(), slot(page, "detail-outer").boundingBox()]);
    expect(Math.abs((noticeTop?.y ?? -1) - (paneTop?.y ?? 0)), "it sits at the top of the pane").toBeLessThanOrEqual(1);
    // Opaque: the page scrolls under it, not through it.
    const behind = await notice.evaluate((element) => getComputedStyle(element.parentElement ?? element).backgroundColor);
    expect(behind).not.toMatch(/rgba?\(0, 0, 0, 0\)|transparent|\/ 0\)/);
  });
});
