import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The title block and the body share one column: the body's text starts
 * where the title and summary start and ends where they end, in the /app
 * pane and on the artifact's page, for every format that shows text. No
 * narrower reading width holds the body back while the title runs on.
 * Measured on the dev fixtures (/dev/workspace, /dev/editor), with no
 * database, and with scrollbars that take room, as on Windows and Linux.
 */

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

/** The text's own edges: an element's box inside its side padding. */
const textEdges = (box: Locator) => box.first().evaluate((element) => {
  const { left, right } = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return { left: left + Number.parseFloat(style.paddingLeft), right: right - Number.parseFloat(style.paddingRight) };
});

/** Both edges of each named part are where the title's are. */
async function expectOneColumn(title: Locator, parts: Record<string, Locator>) {
  const edges = await textEdges(title);
  expect(edges.right - edges.left, "the title has a width to compare with").toBeGreaterThan(200);
  for (const [name, part] of Object.entries(parts)) {
    const part_ = await textEdges(part);
    expect(Math.abs(part_.left - edges.left), `${name} starts where the title starts`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(part_.right - edges.right), `${name} ends where the title ends`).toBeLessThanOrEqual(0.5);
  }
}

const body = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const blocks = (page: Page) => page.locator("[data-slot=ui-block-editor]");

async function openInPane(page: Page, name: RegExp) {
  await page.goto("/dev/workspace");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name }).first().click();
}

/** A window wider than the column, one the column fills, and one where the list and the pane are both narrow. */
const windows = [
  { name: "a wide window", size: { width: 1720, height: 900 } },
  { name: "a window the column fills", size: { width: 1280, height: 800 } },
  { name: "a narrow window", size: { width: 960, height: 800 } },
];

test.describe("in the /app pane", () => {
  test.skip(({ isMobile }) => isMobile, "window widths are set here; the phone check is at the end of this file");
  const title = (page: Page) => page.getByRole("textbox", { name: "Artifact title" });
  const summary = (page: Page) => page.getByRole("textbox", { name: "Artifact summary" });

  for (const { name, size } of windows) {
    test(`should end a Markdown body's text where the title and the summary end, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openInPane(page, /Long markdown fixture/);
      await expect(body(page)).toBeVisible();
      await expectOneColumn(title(page), {
        "the summary": summary(page),
        "the body's first heading": body(page).locator(":scope > :is(h1, h2)"),
        "the body's first paragraph": body(page).locator(":scope > p"),
      });
    });

    test(`should end a plain text body where the title ends, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openInPane(page, /^Note 3\b/);
      await expect(body(page)).toBeVisible();
      await expectOneColumn(title(page), { "the summary": summary(page), "the text field": body(page) });
    });

    test(`should keep an interface's blocks and the title in one column, with the room its block handles need, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openInPane(page, /Long ui fixture/);
      await expect(blocks(page)).toBeVisible();
      await expectOneColumn(title(page), {
        "the summary": summary(page),
        "a heading block": blocks(page).getByRole("textbox", { name: "Heading" }),
        "a text block": blocks(page).getByRole("textbox", { name: "Text" }),
        "the Files section under the body": page.locator("[data-slot=attached-files] > div"),
      });

      // The title block stays where it is when the source replaces the blocks: both keep the room the block handles need.
      const before = await textEdges(title(page));
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "View source" }).click();
      const source = page.getByRole("textbox", { name: "Artifact source" });
      await expect(source).toBeVisible();
      const after = await textEdges(title(page));
      expect(Math.abs(after.left - before.left) + Math.abs(after.right - before.right), "the title does not move under View source").toBeLessThanOrEqual(0.5);
      await expectOneColumn(title(page), { "the source": source });
    });

    test(`should start and end the source where the title does under View source, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openInPane(page, /Long markdown fixture/);
      await expect(body(page)).toBeVisible();
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "View source" }).click();
      const source = page.getByRole("textbox", { name: "Artifact source" });
      await expect(source).toBeVisible();
      await expectOneColumn(title(page), { "the source": source });
    });
  }
});

test.describe("in the /app pane, on a new artifact", () => {
  test.skip(({ isMobile }) => isMobile, "window widths are set here; the phone check is at the end of this file");

  for (const { name, size } of windows) {
    test(`should start the upload row where the title starts, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/dev/workspace");
      await page.getByRole("button", { name: "New artifact" }).first().click();
      const blank = page.getByRole("region", { name: "New artifact" });
      const title = blank.getByRole("textbox", { name: "Artifact title" });
      await expect(title).toBeVisible();
      const upload = blank.getByRole("button", { name: "Upload files" });
      await expect(upload).toBeVisible();
      const edges = await textEdges(title);
      // The button is a box in the row: the box starts at the column's edge, where the title's text starts.
      const box = await upload.boundingBox();
      expect(Math.abs((box?.x ?? -1) - edges.left), "the upload row starts where the title starts").toBeLessThanOrEqual(0.5);
    });
  }
});

test.describe("on the artifact's page", () => {
  test.skip(({ isMobile }) => isMobile, "window widths are set here; the phone check is at the end of this file");
  const title = (page: Page) => page.getByRole("textbox", { name: "Title", exact: true });
  const summary = (page: Page) => page.getByRole("textbox", { name: "Summary", exact: true });

  for (const { name, size } of windows) {
    test(`should end a Markdown body's text where the title and the summary end, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/dev/editor?kind=markdown");
      await expect(body(page)).toBeVisible();
      await expectOneColumn(title(page), {
        "the summary": summary(page),
        "the body's first heading": body(page).locator(":scope > :is(h1, h2)"),
        "the body's first paragraph": body(page).locator(":scope > p"),
      });
    });

    test(`should keep an interface's text blocks and the title in one column, in ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/dev/editor?kind=ui");
      await expect(blocks(page)).toBeVisible();
      await expectOneColumn(title(page), { "the summary": summary(page), "a text block": blocks(page).getByRole("textbox", { name: "Text" }) });
    });
  }

  test("should wrap a long summary inside the column when an editor types one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dev/editor?kind=markdown");
    await expect(body(page)).toBeVisible();
    const oneLine = (await summary(page).boundingBox())?.height ?? 0;

    await summary(page).fill("A long summary that says who writes this page, who reads it, what it decides, and where the companion page with the ranked list of gaps and the decisions for the other side lives, so that it runs well past one line of the column.");
    const fit = await summary(page).evaluate((element) => ({ hiddenAcross: element.scrollWidth - element.clientWidth, hiddenDown: element.scrollHeight - element.clientHeight, height: element.getBoundingClientRect().height }));
    expect(fit.hiddenAcross, "nothing runs off the field's right edge").toBeLessThanOrEqual(0);
    expect(fit.hiddenDown, "every line shows").toBeLessThanOrEqual(1);
    expect(fit.height, "the field grew past one line").toBeGreaterThan(oneLine * 1.5);
    await expectOneColumn(title(page), { "the summary": summary(page) });
  });
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the desktop checks are above");

  test("should keep the title, the summary, and the body's text in one column on the artifact's page", async ({ page }) => {
    await page.goto("/dev/editor?kind=markdown");
    await expect(body(page)).toBeVisible();
    await expectOneColumn(page.getByRole("textbox", { name: "Title", exact: true }), {
      "the summary": page.getByRole("textbox", { name: "Summary", exact: true }),
      "the body's first paragraph": body(page).locator(":scope > p"),
    });
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: document.documentElement.clientWidth }));
    expect(width.scroll, "no horizontal page scroll").toBeLessThanOrEqual(width.inner + 1);
  });
});
