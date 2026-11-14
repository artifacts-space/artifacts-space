import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The /app pane's title block (icon, title, summary, chips, meta line) sits
 * above the box that scrolls the artifact's body. With scrollbars that take
 * room (Windows, Linux, and macOS with "Show scroll bars: Always"), the body
 * is narrower than the title block by the scrollbar, so both must still use
 * one column. Playwright hides scrollbars by default; this file shows them.
 * Measured on /dev/workspace, the real workspace without a database.
 */

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
test.skip(({ isMobile }) => isMobile, "phones scroll the whole page: the title block and the body share one box");

/** A window wide enough that the centered column is narrower than the pane, and one where the column fills the pane. */
const viewports = [
  { name: "a pane wider than the column", size: { width: 1720, height: 1000 } },
  { name: "a pane the column fills", size: { width: 1280, height: 800 } },
];

const slot = (page: Page, name: string) => page.locator(`[data-slot=${name}]`);

/** A box's left and right edges on screen. */
const edgesOf = (box: Locator) => box.evaluate((element) => {
  const { left, right } = element.getBoundingClientRect();
  return { left, right };
});

/** The room the body's scrollbar takes: 0 with overlay scrollbars. */
const scrollbarWidth = (page: Page) => slot(page, "detail-body").evaluate((element) => (element as HTMLElement).offsetWidth - element.clientWidth);

/** Opens the long Markdown fixture, whose body is taller than the pane. */
async function openLongDocument(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/dev/workspace");
  await slot(page, "artifact-list").getByRole("button", { name: /Long markdown fixture/ }).click();
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue("Long markdown fixture");
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toBeVisible();
}

for (const { name, size } of viewports) {
  test(`should start the title, chips, and meta line where the body's text starts when the body shows a scrollbar, in ${name}`, async ({ page }) => {
    await openLongDocument(page, size);
    expect(await scrollbarWidth(page), "the body's scrollbar takes room in this test").toBeGreaterThan(0);

    const column = await edgesOf(slot(page, "detail-body").locator("[data-slot=page-column]").first());
    const text = await edgesOf(page.getByRole("textbox", { name: "Artifact content" }).locator(":scope > *").first());
    const title = await edgesOf(page.getByRole("textbox", { name: "Artifact title" }));
    const summary = await edgesOf(page.getByRole("textbox", { name: "Artifact summary" }));
    // A Markdown page shows no format chip, so the row starts with its project.
    await expect(page.getByRole("button", { name: /^Format: / }), "Markdown has no format chip").toHaveCount(0);
    const chip = await edgesOf(page.getByRole("button", { name: /^(Add to project|Project: )/ }));
    const meta = await edgesOf(slot(page, "save-status").locator(":scope > div"));

    expect(Math.abs(title.left - text.left), "the title starts where the body's text does").toBeLessThanOrEqual(0.5);
    expect(Math.abs(summary.left - text.left), "the summary starts where the body's text does").toBeLessThanOrEqual(0.5);
    expect(Math.abs(chip.left - text.left), "the chips start where the body's text does").toBeLessThanOrEqual(0.5);
    expect(Math.abs(meta.left - column.left), "the meta line's rule starts with the body's column").toBeLessThanOrEqual(0.5);
    expect(Math.abs(meta.right - column.right), "the meta line's rule ends with the body's column").toBeLessThanOrEqual(0.5);
  });
}

test("should wrap the title and the summary inside the column when they are longer than one line", async ({ page }) => {
  await openLongDocument(page, { width: 1280, height: 800 });
  const title = page.getByRole("textbox", { name: "Artifact title" });
  const summary = page.getByRole("textbox", { name: "Artifact summary" });
  const oneLine = { title: (await title.boundingBox())?.height ?? 0, summary: (await summary.boundingBox())?.height ?? 0 };

  await title.fill("A long title for a shared working page: where the room plans stand and how the move off the private feed goes");
  await summary.fill("A long summary that says who writes this page, who reads it, what it decides, and where the companion page with the ranked list of gaps and the decisions for the other side lives.");

  for (const [field, height] of [[title, oneLine.title], [summary, oneLine.summary]] as const) {
    const fit = await field.evaluate((element) => ({ hiddenAcross: element.scrollWidth - element.clientWidth, hiddenDown: element.scrollHeight - element.clientHeight, height: element.getBoundingClientRect().height }));
    expect(fit.hiddenAcross, "nothing runs off the field's right edge").toBeLessThanOrEqual(0);
    expect(fit.hiddenDown, "every line shows").toBeLessThanOrEqual(1);
    expect(fit.height, "the field grew past one line").toBeGreaterThan(height * 1.5);
  }

  const column = await edgesOf(slot(page, "detail-body").locator("[data-slot=page-column]").first());
  expect((await edgesOf(title)).right, "the title stays inside the column").toBeLessThanOrEqual(column.right + 0.5);

  // Still one line of text: Enter moves on to the content and adds no break.
  await title.press("End");
  await title.press("Enter");
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toBeFocused();
  expect(await title.inputValue()).not.toMatch(/[\r\n]/);
});

/** A teammate's page shared by link, read only for the viewer, with tags and without. */
const sharedPages = [
  { name: "with tags", publicId: "fixtureteammatetagged1", tags: ["launch", "rates"] },
  { name: "without tags", publicId: "fixtureteammatenotags1", tags: [] },
];

for (const { name, publicId, tags } of sharedPages) {
  test(`should line the chips and meta line up with the title in a read-only shared page ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/dev/workspace?artifact=${publicId}`);
    const heading = page.getByRole("heading", { name: "Teammate's plan", level: 2 });
    await expect(heading).toBeVisible();
    await expect(slot(page, "panel-meta")).toContainText("Read only");
    await expect(page.getByRole("button", { name: /^Format: / }), "Markdown has no format chip").toHaveCount(0);

    const title = await edgesOf(heading);
    const meta = await edgesOf(slot(page, "panel-meta"));
    expect(Math.abs(meta.left - title.left), "the meta line starts with the title").toBeLessThanOrEqual(0.5);
    if (tags.length === 0) {
      await expect(slot(page, "panel-chips"), "no empty chip row").toHaveCount(0);
      return;
    }
    await expect(slot(page, "panel-chips")).toHaveText(tags.join(""));
    const chips = await edgesOf(slot(page, "panel-chips").locator(":scope > *").first());
    expect(Math.abs(chips.left - title.left), "the first tag starts with the title").toBeLessThanOrEqual(0.5);
  });
}
