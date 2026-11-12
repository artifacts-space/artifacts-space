import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * The Markdown the comment box posts: text stays as typed, a character is
 * escaped only where it would otherwise change how the comment shows, typed
 * and pasted Markdown links become links, and ⌘↵ or Ctrl+↵ posts from any
 * part of the box. Read from what the fixture's thread was sent
 * (`window.fixtureCommentWrites`, /dev/inline-comments).
 */

const list = (page: Page) => page.getByRole("region", { name: "Comments" });
const newComment = (page: Page) => list(page).getByRole("textbox", { name: "Write a comment" });
const postButton = (page: Page) => list(page).getByRole("button", { name: "Comment", exact: true });
const modKey = (page: Page) => page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta" : "Control"));
const writes = (page: Page) => page.evaluate((): unknown => Reflect.get(window, "fixtureCommentWrites") ?? []);

async function openThread(page: Page, query = "") {
  await page.goto(`/dev/inline-comments${query}`);
  await expect(page.getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
  await list(page).scrollIntoViewIfNeeded();
  await expect(newComment(page)).toHaveAttribute("contenteditable", "true");
}

async function typeIn(box: Locator, text: string) {
  await box.click();
  await box.page().keyboard.type(text);
}

/** Pastes plain text into the focused box, as a clipboard paste does. */
async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const posted = (page: Page, text: string) => list(page).locator("article").filter({ hasText: text });

test("should post text as typed when it needs no escapes, and show it the same", async ({ page }) => {
  await openThread(page);
  const typed = "Q&A at 3 < 4pm on snake_case, 2 * 3, and [docs]";
  await typeIn(newComment(page), typed);
  await postButton(page).click();
  await expect(posted(page, "Q&A at 3")).toContainText(typed);
  expect(await writes(page)).toEqual([typed]);
});

test("should escape only what would change how the comment shows", async ({ page }) => {
  await openThread(page);
  await typeIn(newComment(page), "Keep <b>literal</b> and &copy; as letters");
  await postButton(page).click();
  const comment = posted(page, "as letters");
  await expect(comment).toContainText("Keep <b>literal</b> and &copy; as letters");
  await expect(comment.locator("b"), "no tag is made").toHaveCount(0);
  expect(await writes(page)).toEqual(["Keep &lt;b>literal&lt;/b> and &amp;copy; as letters"]);
});

test("should make a typed Markdown link a link and post it as typed", async ({ page }) => {
  await openThread(page);
  const box = newComment(page);
  await typeIn(box, "See [docs](https://example.com) now");
  await expect(box.locator("a[href='https://example.com']"), "the link shows as a link").toHaveText("docs");
  await expect(box).toHaveText("See docs now");
  await postButton(page).click();
  await expect(posted(page, "See docs").getByRole("link", { name: /^docs/ })).toHaveAttribute("href", /^https:\/\/example\.com\/?$/);
  expect(await writes(page)).toEqual(["See [docs](https://example.com) now"]);
});

test("should leave a typed link with an unsafe address as text", async ({ page }) => {
  await openThread(page);
  const box = newComment(page);
  await typeIn(box, "Try [this](javascript:void) later");
  await expect(box.locator("a"), "no link is made").toHaveCount(0);
  await expect(box).toHaveText("Try [this](javascript:void) later");
  await postButton(page).click();
  await expect(posted(page, "later")).toContainText("Try [this](javascript:void) later");
  await expect(posted(page, "later").getByRole("link")).toHaveCount(0);
  expect(await writes(page)).toEqual(["Try [this\\](javascript:void) later"]);
});

test("should make a pasted Markdown link a link, and refuse an unsafe one", async ({ page }) => {
  await openThread(page);
  const box = newComment(page);
  await box.click();
  await paste(page, "Read [the notes](https://example.com/notes) first");
  await expect(box.locator("a[href='https://example.com/notes']")).toHaveText("the notes");
  await postButton(page).click();
  await expect(posted(page, "Read the notes").getByRole("link", { name: /^the notes/ })).toHaveAttribute("href", "https://example.com/notes");
  expect(await writes(page)).toEqual(["Read [the notes](https://example.com/notes) first"]);

  await box.click();
  await paste(page, "Run [this](javascript:alert(1)) **now**");
  await expect(box.locator("strong")).toHaveText("now");
  await expect(box.locator("a"), "no link is made").toHaveCount(0);
  await expect(box, "the refused link pastes as its words").toHaveText("Run this now");
});

test("should post with the shortcut from inside a code block", async ({ page }) => {
  await openThread(page);
  const box = newComment(page);
  await typeIn(box, "``` ");
  await page.keyboard.type("const a = 1");
  await expect(box.locator("pre")).toContainText("const a = 1");
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  await expect(posted(page, "const a = 1").locator("pre")).toContainText("const a = 1");
  expect(await writes(page)).toEqual(["```\nconst a = 1\n```"]);
});

test("should keep escaped Markdown as written through an edit, and post it with the shortcut from there", async ({ page }) => {
  await openThread(page, "?seed=escaped");
  const comment = posted(page, "please");
  await expect(comment).toContainText("@dana please");
  await expect(comment.locator("[data-mention]"), "an escaped @ is no mention").toHaveCount(0);

  await comment.getByRole("button", { name: "Edit" }).click();
  const edit = comment.getByRole("textbox", { name: "Edit comment" });
  await expect(edit).toHaveAttribute("contenteditable", "true");
  const kept = comment.getByRole("textbox", { name: "Markdown kept as written" });
  await expect(kept, "the escaped line stays as written").toHaveValue("\\@dana please");
  await expect(edit.locator("[data-mention]"), "and shows no mention chip").toHaveCount(0);

  // A word added to the plain line keeps its &, <, and _ as typed.
  // A tap past the line's end puts the caret there, on phones as on desktops.
  const line = edit.locator("p", { hasText: "for snake_case" });
  const size = await line.boundingBox();
  await line.click({ position: { x: (size?.width ?? 2) - 2, y: (size?.height ?? 2) / 2 } });
  await page.keyboard.type(" today");
  // A word changed in the kept line keeps its escape.
  await kept.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("e now");
  await page.keyboard.press(`${await modKey(page)}+Enter`);

  await expect(comment.getByRole("textbox", { name: "Edit comment" }), "the shortcut saved the edit").toHaveCount(0);
  expect(await writes(page)).toEqual(["\\@dana please now\n\nQ&A at 3 < 4pm for snake_case today\n\nWrite &amp;copy; for ©"]);
  await expect(comment).toContainText("@dana please now");
  await expect(comment).toContainText("Write &copy; for ©");
  await expect(comment.locator("[data-mention]")).toHaveCount(0);
});
