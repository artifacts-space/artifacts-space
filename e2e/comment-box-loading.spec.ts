import { expect, test, type APIResponse, type Page, type Route } from "@playwright/test";

/*
 * The rich comment box loads on demand. Until it is in, a plain text box
 * with the same name and size stands in its place; if it never loads, the
 * plain box stays, and a comment written there posts as written. Measured
 * on /dev/inline-comments, with the rich box's code held back or refused.
 */

/** Every script chunk the app loads. */
const CHUNKS = "**/_next/static/chunks/**";
/** Words only the rich comment box's code holds (comment-editor.tsx), to tell its chunk from the rest. */
const EDITOR_MARKER = "Comments hold text only.";

/** A chunk fetched by the test: its response for status and headers, and its text read at once. */
interface FetchedChunk {
  response: APIResponse;
  body: string;
}

/**
 * Passes every chunk through, except the rich box's, which goes to `onEditor`.
 * The body is read here, once: a held response may be disposed before it is
 * released, so it is always fulfilled with this text, never read again.
 */
async function routeEditorChunk(page: Page, onEditor: (route: Route, chunk: FetchedChunk) => Promise<void> | void) {
  await page.route(CHUNKS, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(EDITOR_MARKER)) return onEditor(route, { response, body });
    return route.fulfill({ response, body });
  });
}

const list = (page: Page) => page.getByRole("region", { name: "Comments" });
const newComment = (page: Page) => list(page).getByRole("textbox", { name: "Write a comment" });
const modKey = (page: Page) => page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta" : "Control"));
const writes = (page: Page) => page.evaluate((): unknown => Reflect.get(window, "fixtureCommentWrites") ?? []);

async function openThread(page: Page) {
  await page.goto("/dev/inline-comments");
  await expect(page.getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
  await list(page).scrollIntoViewIfNeeded();
}

test("should post from the plain box when the rich box cannot load", async ({ page }) => {
  let refused = 0;
  await routeEditorChunk(page, (route) => {
    refused += 1;
    return route.abort();
  });
  await openThread(page);
  const box = newComment(page);
  await expect(box, "the plain box has the rich box's name").toBeVisible();
  await expect.poll(() => refused, "the rich box's code was asked for and refused").toBeGreaterThan(0);
  await expect(box).toHaveJSProperty("tagName", "TEXTAREA");

  await box.click();
  await page.keyboard.type("Plain **but** fine");
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  const posted = list(page).locator("article").filter({ hasText: "Plain but fine" });
  await expect(posted.locator("strong"), "it posts as Markdown, as written").toHaveText("but");
  expect(await writes(page)).toEqual(["Plain **but** fine"]);
  await expect(box, "the box empties after a post").toHaveValue("");
  await expect(list(page).locator("[data-slot=comment-editor]"), "no rich box appeared").toHaveCount(0);
});

/** Holds the rich box's code until `release` is called, then lets it through. */
async function holdEditorChunk(page: Page) {
  const held: { route: Route; chunk: FetchedChunk }[] = [];
  let released = false;
  await routeEditorChunk(page, (route, chunk) => {
    if (released) return route.fulfill(chunk);
    held.push({ route, chunk });
    return undefined;
  });
  return {
    asked: () => held.length,
    release: async () => {
      released = true;
      await Promise.all(held.map(({ route, chunk }) => route.fulfill(chunk)));
    },
  };
}

/** The rich box has taken over: it is the box, and it has the caret. */
async function expectRichBox(page: Page) {
  const rich = newComment(page);
  await expect(rich, "the rich box took over").toHaveAttribute("contenteditable", "true");
  await expect(rich).toBeFocused();
  return rich;
}

const handovers = [
  { moment: "right after a space", before: "First words typed before it ", after: "loads, and the end.", posted: "First words typed before it loads, and the end." },
  { moment: "mid-word", before: "First wo", after: "rds typed.", posted: "First words typed." },
  // The rich box writes a line break inside a paragraph as Markdown's hard break: two spaces, then the break.
  { moment: "right after a line break", before: "Line one\n", after: "line two", posted: "Line one  \nline two" },
  { moment: "right after a blank line", before: "Para one\n\n", after: "para two", posted: "Para one\n\npara two" },
];

for (const { moment, before, after, posted } of handovers) {
  test(`should keep every character when the rich box takes over ${moment}`, async ({ page }) => {
    const chunk = await holdEditorChunk(page);
    await openThread(page);
    const box = newComment(page);
    await expect(box).toHaveJSProperty("tagName", "TEXTAREA");
    await expect.poll(chunk.asked, "the rich box's code was asked for").toBeGreaterThan(0);

    await box.click();
    await page.keyboard.type(before);
    await expect(box).toHaveValue(before);
    await chunk.release();
    await expectRichBox(page);
    await page.keyboard.type(after);
    await page.keyboard.press(`${await modKey(page)}+Enter`);
    expect(await writes(page), "not one character was lost or moved").toEqual([posted]);
  });
}

test("should keep every character typed while the rich box loads, and not move", async ({ page }) => {
  const chunk = await holdEditorChunk(page);
  await openThread(page);
  const box = newComment(page);
  await expect(box).toHaveJSProperty("tagName", "TEXTAREA");
  await expect.poll(chunk.asked, "the rich box's code was asked for").toBeGreaterThan(0);
  const plainHeight = (await page.locator("[data-slot=comment-box-plain]").boundingBox())?.height ?? 0;
  const fontSize = await box.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  const text = "First words typed before it loads, and more typed while it arrives, and the end.";
  await box.click();
  const typing = page.keyboard.type(text, { delay: 25 });
  await expect.poll(async () => (await newComment(page).evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : ""))).length).toBeGreaterThan(20);
  await chunk.release();
  await typing;

  const rich = await expectRichBox(page);
  await expect(rich).toHaveText(text);
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  expect(await writes(page), "not one character was lost").toEqual([text]);

  const richHeight = (await page.locator("[data-slot=comment-editor]").boundingBox())?.height ?? 0;
  expect(Math.abs(richHeight - plainHeight), "both empty boxes are one height").toBeLessThanOrEqual(1);
  expect(await rich.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(fontSize);
});
