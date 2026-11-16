import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { openGallery } from "./support/gallery";

/*
 * A block looks the same in the interface editor as it does for readers,
 * apart from the caret and the handles. One fixture holds every block whose
 * look comes from a screen prop (a Link's variant and current page, Text and
 * Heading sizes, weights, tones and alignment, Badge variants and icons, a
 * List's markers, Button sizes and the danger fill, a Textarea's rows, a
 * vertical rule, a plain Metric, a row drawn in reverse once it has
 * stacked, a Box that grows in a row, a Link's icon at either side, the
 * accent tone on Text and a Badge, a pressed Button, a Badge's dot, and the
 * display pieces: an AvatarGroup, a Kbd, a Rating, and a Grid cell that
 * spans two of three columns). It is drawn for readers in the gallery and opened in the editor on
 * the editor fixture, and each block's computed style is compared between
 * the two.
 */

/** What decides how a block's words look. */
const textStyle = ["color", "font-size", "font-weight", "font-family", "text-align", "text-transform", "letter-spacing", "line-height", "text-decoration-line"] as const;

/** Every block with words, by its words. */
const words = ["Product", "Pricing", "Changelog", "Careers", "New this week", "Count every shelf", "Stock that keeps up", "Small heading at the end", "order-4821", "Ends on Friday", "Shipped", "Beta", "Draft", "Unlimited projects", "Weekly reports", "Grows to fill the row", "Words first on a phone", "Shelves counted", "Online", "Wide cell", "Narrow cell", "Picked by the team", "Featured"];

const readView = (page: Page) => page.locator('section#specs [data-specimen="Styled blocks"]');
const editorView = (page: Page) => page.locator("[data-slot=ui-block-editor]");

function styleOf(target: Locator, properties: readonly string[]): Promise<Record<string, string>> {
  return target.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, [...properties]);
}

/** The box around a block's words (a badge's pill, a list item): its fill, its edge, and the icons in it. */
function boxOf(target: Locator): Promise<{ fill: string; edge: string; icons: number; iconColor: string; dot: string }> {
  return target.evaluate((element) => {
    const box = element.parentElement ?? element;
    const style = getComputedStyle(box);
    const icon = box.querySelector("svg");
    const dot = box.querySelector("[data-badge-dot]");
    return { fill: style.backgroundColor, edge: style.borderTopColor, icons: box.querySelectorAll("svg").length, iconColor: icon ? getComputedStyle(icon).color : "", dot: dot ? getComputedStyle(dot).backgroundColor : "" };
  });
}

/** The display pieces' sizes, and what each shows: the circles of the avatar row, the keys, the stars, and the lone dot's color. */
async function displayOf(view: Locator) {
  const row = view.getByRole("group", { name: "Display pieces" });
  const size = (target: Locator) => target.evaluate((element) => { const box = element.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; });
  const faces = row.getByRole("img", { name: /^3 people/ });
  const stars = row.getByRole("img", { name: "3.5 out of 5" });
  return {
    faces: await size(faces),
    circles: await faces.locator("[data-avatar-person], [data-avatar-more]").count(),
    keys: await size(row.locator("kbd").first()),
    stars: await size(stars),
    full: await stars.locator('[data-star="full"]').count(),
    lone: await row.locator('[data-badge-dot="only"]').evaluate((element) => getComputedStyle(element).backgroundColor),
    spans: await spanShares(view),
  };
}

/** Each spanned cell's share of its grid's width, in percent, in order. */
function spanShares(view: Locator): Promise<number[]> {
  return view.locator("[data-grid-span]").evaluateAll((cells) => cells.map((cell) => {
    const grid = cell.parentElement?.getBoundingClientRect().width ?? 1;
    return Math.round((cell.getBoundingClientRect().width / grid) * 100);
  }));
}

/** How a view draws the fixture: each block's text style, the boxes that carry icons, and the widths in the row that grows. */
async function drawn(view: Locator) {
  const text: Record<string, Record<string, string>> = {};
  for (const word of words) text[word] = await styleOf(view.getByText(word, { exact: true }), textStyle);
  const boxes: Record<string, Awaited<ReturnType<typeof boxOf>>> = {};
  for (const word of ["Shipped", "Beta", "Draft", "Featured", "Online", "Unlimited projects", "Weekly reports"]) boxes[word] = await boxOf(view.getByText(word, { exact: true }));
  const hero = view.getByRole("group", { name: "Styled hero" });
  const width = (target: Locator) => target.evaluate((element) => element.getBoundingClientRect().width);
  const row = await width(hero);
  const art = await width(hero.getByRole("img", { name: "Screenshot" }));
  const buttons = await Promise.all(["Start free", "Open menu", "Delete draft", "Bold"].map((name) => styleOf(view.getByRole("button", { name }), ["height", "font-size", "color", "background-color", "border-top-color"])));
  const pressed = await view.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed");
  // The rule between the buttons, as tall as its row.
  const rule = Math.round(await view.getByRole("separator").first().evaluate((element) => element.getBoundingClientRect().height));
  // The row that stacks in reverse: whether its words sit above its picture, and the share of the row the picture takes.
  const stacked = view.getByRole("group", { name: "Stacked row" });
  const top = (target: Locator) => target.evaluate((element) => element.getBoundingClientRect().top);
  const shot = stacked.locator("[data-frame=browser]");
  const wordsFirst = (await top(stacked.getByText("Words first on a phone", { exact: true }))) < (await top(shot));
  const shotShare = Math.round(((await width(shot)) / (await width(stacked))) * 100);
  // The plain Metric: no card around its label.
  const stat = await styleOf(view.getByText("Shelves counted", { exact: true }).locator("xpath=.."), ["box-shadow", "padding-top", "border-top-width"]);
  const height = (name: string) => view.getByRole("textbox", { name, exact: true }).evaluate((element) => Math.round(element.getBoundingClientRect().height));
  const notes = { short: await height("Short note"), long: await height("Long note") };
  return { text, boxes, artShare: Math.round((art / row) * 100), buttons, pressed, notes, rule, wordsFirst, shotShare, stat, display: await displayOf(view) };
}

/** A link's icon: the side it is drawn on, its size, its color, and the gap to the words. */
function linkIconOf(holder: Locator): Promise<Record<string, string | number> | null> {
  return holder.evaluate((element) => {
    const icon = element.querySelector("[data-link-icon]");
    if (!icon) return null;
    const style = getComputedStyle(icon);
    const box = icon.getBoundingClientRect();
    return { side: icon.getAttribute("data-link-icon") ?? "", width: Math.round(box.width), height: Math.round(box.height), color: style.color, gap: style.marginLeft === "0px" ? style.marginRight : style.marginLeft };
  });
}

type Drawn = Awaited<ReturnType<typeof drawn>>;

/** The words of the styled fixture carry the styles it sets. */
function expectStyledWords(text: Drawn["text"]) {
  expect(text.Product?.["text-decoration-line"]).toBe("underline");
  expect(text.Pricing?.["text-decoration-line"]).toBe("none");
  expect(text.Changelog?.color).not.toBe(text.Careers?.color);
  expect(text["Count every shelf"]?.["text-align"]).toBe("center");
  expect(text["Ends on Friday"]?.["text-align"]).toBe("end");
}

/** The pressed Button is on and filled with the text color, and the accent Badge's edge is not a neutral one. */
function expectPressedAndAccent(forReaders: Drawn) {
  expect(forReaders.pressed).toBe("true");
  expect(forReaders.buttons[3]?.["background-color"]).toBe(forReaders.text["Grows to fill the row"]?.color);
  expect(forReaders.boxes.Featured?.edge).not.toBe(forReaders.boxes.Draft?.edge);
}

/** What the fixture is there to show, so equal does not mean equally plain. */
function expectStyledFixture(forReaders: Drawn, isMobile: boolean) {
  expectStyledWords(forReaders.text);
  expect(forReaders.boxes.Shipped?.icons).toBe(1);
  expect(forReaders.boxes["Unlimited projects"]?.icons).toBe(1);
  expect(forReaders.boxes.Online?.dot).not.toBe("");
  expect(forReaders.display.circles).toBe(3);
  expect(forReaders.display.full).toBe(3);
  // Two of three columns where the grid is wide; on a phone each cell is the full row.
  expect(forReaders.display.spans).toHaveLength(2);
  const [wide = 0, narrowCell = 0] = forReaders.display.spans;
  if (isMobile) expect([wide, narrowCell]).toEqual([100, 100]);
  else expect(wide).toBeGreaterThan(narrowCell * 1.8);
  expect(forReaders.artShare).toBeGreaterThan(30);
  expect(forReaders.notes.long).toBeGreaterThan(forReaders.notes.short + 60);
  expect(forReaders.rule).toBeGreaterThan(20);
  expect(forReaders.stat["box-shadow"]).toBe("none");
  expect(forReaders.buttons[2]?.["background-color"]).not.toBe(forReaders.buttons[0]?.["background-color"]);
  expectPressedAndAccent(forReaders);
  // On a phone the row has stacked, words first; on a desktop it is a row with the picture first.
  expect(forReaders.wordsFirst).toBe(isMobile);
}

test("should draw every styled block in the editor as it is drawn for readers", async ({ page, isMobile }) => {
  await openGallery(page, ["specs"]);
  const read = readView(page);
  await read.scrollIntoViewIfNeeded();
  await expect(read.getByText("Count every shelf", { exact: true })).toBeVisible();
  const forReaders = await drawn(read);
  // The link that leaves the page: its words, and the arrow after them.
  const readLink = read.getByRole("link", { name: /Read the docs/ });
  const linkForReaders = { style: await styleOf(readLink, textStyle), arrows: await readLink.locator("svg:not([data-link-icon])").count(), icon: await linkIconOf(readLink) };
  const menuIconForReaders = await linkIconOf(read.getByText("Pricing", { exact: true }));

  await page.goto("/dev/editor?kind=styled");
  const editor = editorView(page);
  await expect(editor.getByRole("textbox", { name: "Heading" }).first()).toHaveText("Count every shelf");
  const inEditor = await drawn(editor);
  const editLink = editor.getByRole("textbox", { name: /^Link text \(opens/ });
  await expect(editLink).toHaveText("Read the docs");
  const editHolder = editLink.locator("xpath=..");
  const linkInEditor = { style: await styleOf(editLink, textStyle), arrows: await editHolder.locator("svg:not([data-link-icon])").count(), icon: await linkIconOf(editHolder) };
  const menuIconInEditor = await linkIconOf(editor.getByText("Pricing", { exact: true }).locator("xpath=.."));

  for (const word of words) expect(inEditor.text[word], `the words "${word}"`).toEqual(forReaders.text[word]);
  expect(inEditor.boxes).toEqual(forReaders.boxes);
  expect(inEditor.buttons).toEqual(forReaders.buttons);
  expect(inEditor.pressed, "the pressed Button says it is on").toBe(forReaders.pressed);
  expect(inEditor.notes, "the heights of the two-row and six-row text areas").toEqual(forReaders.notes);
  expect(inEditor.stat, "the plain Metric").toEqual(forReaders.stat);
  expect(inEditor.display, "the avatar row, the keys, the stars, and the lone dot").toEqual(forReaders.display);
  expect(inEditor.wordsFirst, "the order of the row that stacks in reverse").toBe(forReaders.wordsFirst);
  expect(Math.abs(inEditor.shotShare - forReaders.shotShare), "the picture's share of the row that stacks").toBeLessThanOrEqual(2);
  expect(Math.abs(inEditor.rule - forReaders.rule), "the height of the rule between the buttons").toBeLessThanOrEqual(2);
  expect(linkInEditor).toEqual(linkForReaders);
  expect(menuIconInEditor, "the icon after a nav link's words").toEqual(menuIconForReaders);
  expect(Math.abs(inEditor.artShare - forReaders.artShare), "the placeholder's share of the row that grows").toBeLessThanOrEqual(1);

  expect(linkForReaders.arrows).toBe(1);
  expect(linkForReaders.icon?.side).toBe("start");
  expect(menuIconForReaders?.side).toBe("end");
  expectStyledFixture(forReaders, isMobile);
});
