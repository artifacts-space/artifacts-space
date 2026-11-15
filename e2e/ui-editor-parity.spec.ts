import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/*
 * A block looks the same in the interface editor as it does for readers,
 * apart from the caret and the handles. One fixture holds every block whose
 * look comes from a screen prop (a Link's variant and current page, Text and
 * Heading sizes, weights, tones and alignment, Badge variants and icons, a
 * List's markers, Button sizes, a Box that grows in a row). It is drawn for
 * readers in the gallery and opened in the editor on the editor fixture, and
 * each block's computed style is compared between the two.
 */

/** What decides how a block's words look. */
const textStyle = ["color", "font-size", "font-weight", "font-family", "text-align", "text-transform", "letter-spacing", "line-height", "text-decoration-line"] as const;

/** Every block with words, by its words. */
const words = ["Product", "Pricing", "Changelog", "Careers", "New this week", "Count every shelf", "Stock that keeps up", "Small heading at the end", "order-4821", "Ends on Friday", "Shipped", "Beta", "Draft", "Unlimited projects", "Weekly reports", "Grows to fill the row"];

const readView = (page: Page) => page.locator('section#specs [data-specimen="Styled blocks"]');
const editorView = (page: Page) => page.locator("[data-slot=ui-block-editor]");

function styleOf(target: Locator, properties: readonly string[]): Promise<Record<string, string>> {
  return target.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, [...properties]);
}

/** The box around a block's words (a badge's pill, a list item): its fill, its edge, and the icons in it. */
function boxOf(target: Locator): Promise<{ fill: string; edge: string; icons: number; iconColor: string }> {
  return target.evaluate((element) => {
    const box = element.parentElement ?? element;
    const style = getComputedStyle(box);
    const icon = box.querySelector("svg");
    return { fill: style.backgroundColor, edge: style.borderTopColor, icons: box.querySelectorAll("svg").length, iconColor: icon ? getComputedStyle(icon).color : "" };
  });
}

/** How a view draws the fixture: each block's text style, the boxes that carry icons, and the widths in the row that grows. */
async function drawn(view: Locator) {
  const text: Record<string, Record<string, string>> = {};
  for (const word of words) text[word] = await styleOf(view.getByText(word, { exact: true }), textStyle);
  const boxes: Record<string, Awaited<ReturnType<typeof boxOf>>> = {};
  for (const word of ["Shipped", "Beta", "Draft", "Unlimited projects", "Weekly reports"]) boxes[word] = await boxOf(view.getByText(word, { exact: true }));
  const hero = view.getByRole("group", { name: "Styled hero" });
  const width = (target: Locator) => target.evaluate((element) => element.getBoundingClientRect().width);
  const row = await width(hero);
  const art = await width(hero.getByRole("img", { name: "Screenshot" }));
  const buttons = await Promise.all(["Start free", "Open menu"].map((name) => styleOf(view.getByRole("button", { name }), ["height", "font-size", "color", "background-color"])));
  return { text, boxes, artShare: Math.round((art / row) * 100), buttons };
}

test("should draw every styled block in the editor as it is drawn for readers", async ({ page }) => {
  await page.goto("/dev/components#specs");
  const read = readView(page);
  await read.scrollIntoViewIfNeeded();
  await expect(read.getByText("Count every shelf", { exact: true })).toBeVisible();
  const forReaders = await drawn(read);
  // The link that leaves the page: its words, and the arrow after them.
  const readLink = read.getByRole("link", { name: /Read the docs/ });
  const linkForReaders = { style: await styleOf(readLink, textStyle), arrows: await readLink.locator("svg").count() };

  await page.goto("/dev/editor?kind=styled");
  const editor = editorView(page);
  await expect(editor.getByRole("textbox", { name: "Heading" }).first()).toHaveText("Count every shelf");
  const inEditor = await drawn(editor);
  const editLink = editor.getByRole("textbox", { name: /^Link text \(opens/ });
  await expect(editLink).toHaveText("Read the docs");
  const linkInEditor = { style: await styleOf(editLink, textStyle), arrows: await editLink.locator("xpath=..").locator("svg").count() };

  for (const word of words) expect(inEditor.text[word], `the words "${word}"`).toEqual(forReaders.text[word]);
  expect(inEditor.boxes).toEqual(forReaders.boxes);
  expect(inEditor.buttons).toEqual(forReaders.buttons);
  expect(linkInEditor).toEqual(linkForReaders);
  expect(Math.abs(inEditor.artShare - forReaders.artShare), "the placeholder's share of the row that grows").toBeLessThanOrEqual(1);

  // What the fixture is there to show, so equal does not mean equally plain.
  expect(forReaders.text.Product?.["text-decoration-line"]).toBe("underline");
  expect(forReaders.text.Pricing?.["text-decoration-line"]).toBe("none");
  expect(forReaders.text.Changelog?.color).not.toBe(forReaders.text.Careers?.color);
  expect(forReaders.text["Count every shelf"]?.["text-align"]).toBe("center");
  expect(forReaders.text["Ends on Friday"]?.["text-align"]).toBe("end");
  expect(forReaders.boxes.Shipped?.icons).toBe(1);
  expect(forReaders.boxes["Unlimited projects"]?.icons).toBe(1);
  expect(linkForReaders.arrows).toBe(1);
  expect(forReaders.artShare).toBeGreaterThan(30);
});
