import type { APIResponse, Page, Route } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

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
  allowPageError("net::ERR_FAILED", "The test refuses every request for the rich box's code.");
  allowPageError(
    "ChunkLoadError",
    "The bundler retries the refused chunk once, then rejects the import; CommentEditorBoundary catches that and React logs the caught error.",
  );
  await routeEditorChunk(page, (route) => {
    refused += 1;
    return route.abort();
  });
  // The retry comes 200 to 600 ms after the first refusal, so wait for the import to fail for good:
  // the rest of the test then runs on a page whose rich box can no longer arrive.
  const gaveUp = page.waitForEvent("console", { predicate: (message) => message.text().includes("ChunkLoadError") });
  await openThread(page);
  const box = newComment(page);
  await expect(box, "the plain box has the rich box's name").toBeVisible();
  await expect.poll(() => refused, "the rich box's code was asked for and refused").toBeGreaterThan(0);
  await gaveUp;
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

/** Requests for the rich box's code held by the running test and not yet released. */
const waiting = new Set<Route>();

/** Holds the rich box's code until `release` is called, then lets it through. */
async function holdEditorChunk(page: Page) {
  const held: { route: Route; chunk: FetchedChunk }[] = [];
  let released = false;
  await routeEditorChunk(page, (route, chunk) => {
    if (released) return route.fulfill(chunk);
    held.push({ route, chunk });
    waiting.add(route);
    return undefined;
  });
  return {
    asked: () => held.length,
    release: async () => {
      released = true;
      await Promise.all(held.map(({ route, chunk }) => {
        waiting.delete(route);
        return route.fulfill(chunk);
      }));
    },
  };
}

/**
 * Every held request was let through, and no chunk handler outlives the
 * test: a chunk still being fetched as the page closes would fail it with
 * "Test ended" or a disposed response.
 */
test.afterEach(async ({ page }) => {
  const left = waiting.size;
  waiting.clear();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  expect(left, "no held request for the rich box's code was left waiting").toBe(0);
});

/** The rich box has taken over: it is the box, and it has the caret. */
async function expectRichBox(page: Page) {
  const rich = newComment(page);
  await expect(rich, "the rich box took over").toHaveAttribute("contenteditable", "true");
  await expect(rich).toBeFocused();
  return rich;
}

/** Lets the rich box's code in, and waits until the rich box exists, ready to take over. */
async function releaseAndWait(page: Page, chunk: Awaited<ReturnType<typeof holdEditorChunk>>) {
  await chunk.release();
  await expect(list(page).locator("[data-slot=comment-editor] [contenteditable]"), "the rich box is ready").toHaveCount(1);
}

test("should take over at once when the box is empty and focused, at the same size", async ({ page }) => {
  const chunk = await holdEditorChunk(page);
  await openThread(page);
  const box = newComment(page);
  await expect(box).toHaveJSProperty("tagName", "TEXTAREA");
  await expect.poll(chunk.asked, "the rich box's code was asked for").toBeGreaterThan(0);
  const plainHeight = (await page.locator("[data-slot=comment-box-plain]").boundingBox())?.height ?? 0;
  const fontSize = await box.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await box.click();
  await chunk.release();
  const rich = await expectRichBox(page);
  const richHeight = (await page.locator("[data-slot=comment-editor]").boundingBox())?.height ?? 0;
  expect(Math.abs(richHeight - plainHeight), "both empty boxes are one height").toBeLessThanOrEqual(1);
  expect(await rich.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(fontSize);

  await page.keyboard.type("Typed in the **rich** box.");
  await expect(rich.locator("strong"), "typing goes on in the rich box").toHaveText("rich");
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  expect(await writes(page)).toEqual(["Typed in the **rich** box."]);
});

/** Moments the rich box can arrive while someone is typing, and how the whole text shows once it takes over. */
const moments = [
  { moment: "right after a space", before: "Some **bold** words ", after: "and the end.", shows: "strong" },
  { moment: "mid-word", before: "Some **bo", after: "ld** words.", shows: "strong" },
  { moment: "right after a line break", before: "**Line** one\n", after: "line two", shows: "strong" },
  { moment: "right after a closed code fence", before: "```\nconst a = 1;\n```\n", after: "After the fence.", shows: "pre" },
  { moment: "right after a table row", before: "| a | b |\n| - | - |\n| 1 | 2 |\n", after: "| 3 | 4 |", shows: "table" },
];

/** Types `before`, lets the rich box arrive, and types `after`: the plain box stays the whole time, with every character. */
async function typeWhileItArrives(page: Page, before: string, after: string) {
  const chunk = await holdEditorChunk(page);
  await openThread(page);
  const box = newComment(page);
  await expect(box).toHaveJSProperty("tagName", "TEXTAREA");
  await expect.poll(chunk.asked, "the rich box's code was asked for").toBeGreaterThan(0);
  const plainBox = page.locator("[data-slot=comment-box-plain]");

  await box.click();
  await page.keyboard.type(before);
  // Its size, not its place: the artifact above loads its own rich view from the same code.
  const size = (await plainBox.boundingBox()) ?? undefined;
  await releaseAndWait(page, chunk);
  await expect(box, "no swap while typing").toHaveJSProperty("tagName", "TEXTAREA");
  await expect(box).toBeFocused();
  const now = (await plainBox.boundingBox()) ?? undefined;
  expect({ width: now?.width, height: now?.height }, "the box kept its size").toEqual({ width: size?.width, height: size?.height });
  await page.keyboard.type(after);
  await expect(box).toHaveValue(before + after);
  await expect(box, "still no swap").toHaveJSProperty("tagName", "TEXTAREA");
  return box;
}

for (const { moment, before, after, shows } of moments) {
  test(`should keep the plain box when the rich box arrives ${moment}, and post exactly what was typed`, async ({ page }) => {
    await typeWhileItArrives(page, before, after);
    await page.keyboard.press(`${await modKey(page)}+Enter`);
    expect(await writes(page), "not one character was lost or moved").toEqual([before + after]);
    await expectRichBox(page);
  });

  test(`should show the text formatted once the box loses focus ${moment}, and post it unedited exactly as typed`, async ({ page }) => {
    const box = await typeWhileItArrives(page, before, after);
    await box.blur();
    const rich = newComment(page);
    await expect(rich, "the rich box took over").toHaveAttribute("contenteditable", "true");
    await expect(rich.locator(shows).first(), "the text shows formatted").toBeVisible();
    await list(page).getByRole("button", { name: "Comment", exact: true }).click();
    expect(await writes(page), "an unedited comment posts as typed").toEqual([before + after]);
  });
}

test("should post with the button while the plain box is being typed in, and not swap under the pointer", async ({ page }) => {
  const box = await typeWhileItArrives(page, "Some **bold** words ", "and a long tail.");
  const post = list(page).getByRole("button", { name: "Comment", exact: true });
  await post.scrollIntoViewIfNeeded();
  const spot = await post.boundingBox();
  expect(spot, "the button is on screen").not.toBeNull();
  await page.mouse.move((spot?.x ?? 0) + (spot?.width ?? 0) / 2, (spot?.y ?? 0) + (spot?.height ?? 0) / 2);
  await page.mouse.down();
  await expect(box, "no swap on the press").toHaveJSProperty("tagName", "TEXTAREA");
  await expect(box).toBeFocused();
  await page.mouse.up();
  await expect.poll(() => writes(page), "the click posted, as typed").toEqual(["Some **bold** words and a long tail."]);
  await expectRichBox(page);
});

const trailingTails = [
  { tail: "a space", before: "Some **bold** words ", after: "more.", posted: "Some **bold** words more." },
  { tail: "a line break", before: "Some **bold** words\n", after: "more.", posted: "Some **bold** words\nmore." },
];

for (const { tail, before, after, posted } of trailingTails) {
  test(`should keep the plain box when it loses focus with text ending in ${tail}, and post the next word apart`, async ({ page }) => {
    const box = await typeWhileItArrives(page, before, "");
    await list(page).getByRole("heading", { name: /Comments/ }).click();
    await expect(box, "the box lost focus").not.toBeFocused();
    await expect(box, "the plain box stays, so the rich box cannot drop the tail").toHaveJSProperty("tagName", "TEXTAREA");
    await expect(box).toHaveValue(before);
    // Back in the box, the caret is where it was: after the tail.
    await box.focus();
    await page.keyboard.type(after);
    await expect(box).toHaveValue(before + after);
    await page.keyboard.press(`${await modKey(page)}+Enter`);
    expect(await writes(page), "the next word did not join the last").toEqual([posted]);
    await expectRichBox(page);
  });
}

test("should post what the thread then shows when the text is edited after the swap", async ({ page }) => {
  const box = await typeWhileItArrives(page, "Some **bo", "ld** words");
  await box.blur();
  const rich = newComment(page);
  await expect(rich.locator("strong")).toHaveText("bold");
  await rich.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more.");
  await expect(rich).toHaveText("Some bold words and more.");
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  expect(await writes(page)).toEqual(["Some **bold** words and more."]);
  const posted = list(page).locator("article").filter({ hasText: "Some bold words and more." });
  await expect(posted.locator("strong"), "the thread shows what the box showed").toHaveText("bold");
});
