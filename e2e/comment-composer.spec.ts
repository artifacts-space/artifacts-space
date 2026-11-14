import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { card, highlighted, pointOn } from "./support/inline-comments";

/*
 * The comment box shows formatting as you type: one box, no Write and
 * Preview tabs. Measured on /dev/inline-comments (the real thread and the
 * cards at the text, kept in memory, with teammates to mention; the
 * Markdown each post sends is in `window.fixtureCommentWrites`), the
 * component gallery, and /dev/workspace. The Markdown the box writes is in
 * comment-box-markdown.spec.ts; the plain box shown while it loads, in
 * comment-box-loading.spec.ts.
 */

const list = (page: Page) => page.getByRole("region", { name: "Comments" });
const newComment = (page: Page) => list(page).getByRole("textbox", { name: "Write a comment" });
/** The editor's Mod key in this browser: ⌘ where the platform is a Mac, Ctrl elsewhere (an emulated phone included). */
const modKey = (page: Page) => page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta" : "Control"));

async function openThread(page: Page, query = "?seed=1") {
  await page.goto(`/dev/inline-comments${query}`);
  await expect(page.getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
  await list(page).scrollIntoViewIfNeeded();
  await expect(newComment(page)).toHaveAttribute("contenteditable", "true");
}

/** No Write or Preview tab anywhere on the page. */
async function expectNoTabs(page: Page) {
  await expect(page.getByRole("tab", { name: "Write" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveCount(0);
}

/** True when the page scrolls sideways. */
function scrollsSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

/** Types into the box the way a person does, key by key, so Markdown shortcuts run. */
async function typeIn(box: Locator, text: string) {
  await box.click();
  await box.page().keyboard.type(text);
}

/** The comment bodies the fixture's thread was sent, oldest first. */
const writes = (page: Page) => page.evaluate((): unknown => Reflect.get(window, "fixtureCommentWrites") ?? []);

test("should show formatting in the box as it is typed and post the same Markdown", async ({ page }) => {
  await openThread(page);
  await expectNoTabs(page);
  const box = newComment(page);
  await expect(box, "the box is a textbox with a name for screen readers").toHaveAttribute("role", "textbox");
  await expect(box).toHaveAccessibleName("Write a comment");

  await typeIn(box, "Ship **this** first");
  await expect(box.locator("strong"), "bold looks bold").toHaveText("this");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await expect(box.locator("li"), "a list is a list").toHaveText(["one", "two"]);
  await expect(box, "the Markdown marks are gone from the text").not.toContainText("**");

  await list(page).getByRole("button", { name: "Comment", exact: true }).click();
  const posted = list(page).locator("article").filter({ hasText: "Ship this first" });
  await expect(posted.locator("strong")).toHaveText("this");
  await expect(posted.locator("li")).toHaveText(["one", "two"]);
  await expect(box, "the box empties after a post").toHaveText("");
  expect(await writes(page), "what posts is Markdown").toEqual(["Ship **this** first\n\n- one\n- two"]);
});

test("should keep text 16px on phones and never scroll sideways", async ({ page, isMobile }) => {
  await openThread(page);
  const size = await newComment(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  if (isMobile) expect(size, "iOS does not zoom into a 16px field").toBeGreaterThanOrEqual(16);
  await typeIn(newComment(page), "A long line with a long link https://example.com/a/very/long/path/that/keeps/going/and/going/without/a/break");
  expect(await scrollsSideways(page)).toBe(false);
});

test("should pick a mention with the keyboard and post it as @handle", async ({ page }) => {
  await openThread(page);
  const box = newComment(page);
  await typeIn(box, "Thanks @");
  const suggestions = page.getByRole("listbox", { name: "Mention suggestions" });
  await expect(suggestions.getByRole("option")).toHaveText([/@claude-code/, /@dana/, /@leah/]);
  // A textbox has no aria-expanded; it points at the list and its highlighted option instead.
  await expect(box).toHaveAttribute("role", "textbox");
  await expect(box).not.toHaveAttribute("aria-expanded");
  await expect(box).toHaveAttribute("aria-controls", /.+/);

  await page.keyboard.press("ArrowDown");
  await expect(suggestions.getByRole("option", { selected: true })).toContainText("@dana");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("Enter");
  await expect(suggestions).toHaveCount(0);
  await expect(box).toHaveText("Thanks @dana ");
  await expect(box.locator("[data-mention=dana]"), "a mention that reaches someone shows as a chip").toHaveText("@dana");

  // Escape closes the list and leaves the box and its text as they were.
  await page.keyboard.type("and @le");
  await expect(suggestions.getByRole("option")).toHaveText([/@leah/]);
  await page.keyboard.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(box).toBeFocused();

  // ⌘↵ or Ctrl+↵ posts, from a keyboard on any screen.
  await page.keyboard.press(`${await modKey(page)}+Enter`);
  await expect(list(page).locator("article").filter({ hasText: "Thanks @dana and @le" })).toHaveCount(1);
  expect(await writes(page)).toEqual(["Thanks @dana and @le"]);
});

test("should close only the suggestions when Escape is pressed in the Comments dialog", async ({ page }) => {
  await page.goto("/dev/inline-comments?dialog=1");
  await page.getByRole("button", { name: "Comments" }).click();
  const dialog = page.getByRole("dialog");
  const box = dialog.getByRole("textbox", { name: "Write a comment" });
  await expect(box).toHaveAttribute("contenteditable", "true");
  await typeIn(box, "Ask @le");
  const suggestions = page.getByRole("listbox", { name: "Mention suggestions" });
  await expect(suggestions.getByRole("option")).toHaveText([/@leah/]);

  await page.keyboard.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(dialog, "the first Escape leaves the dialog open").toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveText("Ask @le");

  await page.keyboard.press("Escape");
  await expect(dialog, "the next Escape closes the dialog").toHaveCount(0);
});

test("should close only the suggestions when Escape is pressed in the card at the text", async ({ page }) => {
  await page.goto("/dev/inline-comments?as=reader&seed=1");
  const article = page.locator("[data-slot=inline-comment-surface]");
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
  const words = await pointOn(article, "single writer");
  await page.mouse.click(words.x, words.y);
  const reply = card(page).getByRole("textbox", { name: "Write a reply" });
  await expect(reply).toHaveAttribute("contenteditable", "true");
  await typeIn(reply, "Ask @le");
  const suggestions = page.getByRole("listbox", { name: "Mention suggestions" });
  await expect(suggestions.getByRole("option")).toHaveText([/@leah/]);

  await page.keyboard.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(card(page), "the first Escape leaves the card open").toBeVisible();
  await expect(reply).toHaveText("Ask @le");
});

test("should keep the draft and say why when a post fails", async ({ page }) => {
  await openThread(page, "");
  const box = newComment(page);
  await typeIn(box, "Ship it, **please fail** this once");
  await list(page).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(list(page).getByText("The comment could not be saved. Try again.")).toBeVisible();
  await expect(box, "the draft stays, formatted").toHaveText("Ship it, please fail this once");
  await expect(box.locator("strong")).toHaveText("please fail");
  expect(await writes(page)).toEqual(["Ship it, **please fail** this once"]);
  await expect(list(page).locator("article").filter({ hasText: "this once" })).toHaveCount(0);
});

test("should keep a comment's Markdown when it is edited", async ({ page }) => {
  await openThread(page, "");
  await typeIn(newComment(page), "Read **all** of it:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. notes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("runbook");
  await list(page).getByRole("button", { name: "Comment", exact: true }).click();
  const posted = list(page).locator("article").filter({ hasText: "Read all of it:" });
  await expect(posted.locator("ol li")).toHaveText(["notes", "runbook"]);

  await posted.getByRole("button", { name: "Edit" }).click();
  const edit = posted.getByRole("textbox", { name: "Edit comment" });
  await expect(edit.locator("strong"), "the edit box shows the comment formatted").toHaveText("all");
  await expect(edit.locator("ol li")).toHaveText(["notes", "runbook"]);
  await edit.locator("ol li").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" too");
  await posted.getByRole("button", { name: "Save" }).click();

  const saved = list(page).locator("article").filter({ hasText: "Read all of it:" });
  await expect(saved.locator("strong")).toHaveText("all");
  await expect(saved.locator("ol li")).toHaveText(["notes", "runbook too"]);
  expect(await writes(page)).toEqual(["Read **all** of it:\n\n1. notes\n2. runbook", "Read **all** of it:\n\n1. notes\n2. runbook too"]);
});

test("should keep the reply box compact in the card at the text, and out of the document's words", async ({ page }) => {
  await page.goto("/dev/inline-comments?as=reader&seed=1");
  const article = page.locator("[data-slot=inline-comment-surface]");
  await expect(article.getByRole("heading", { name: "Moving off the feed" })).toBeVisible();
  await expect.poll(async () => (await highlighted(page)).marked).toEqual(["single writer"]);
  const words = await pointOn(article, "single writer");
  await page.mouse.click(words.x, words.y);
  await expect(card(page)).toContainText("Should Leah be able to write too?");

  const reply = card(page).getByRole("textbox", { name: "Write a reply" });
  await expect(reply).toHaveAttribute("contenteditable", "true");
  await expectNoTabs(page);
  const height = (await reply.boundingBox())?.height ?? 0;
  expect(height, "the reply box is short in the card").toBeLessThanOrEqual(72);
  expect(height).toBeGreaterThanOrEqual(56);

  const placement = await reply.evaluate((element) => ({ skipped: element.closest("[data-comment-skip]") !== null, root: element.closest("[data-comment-root]") !== null }));
  expect(placement, "inline comments never read the box as document words").toEqual({ skipped: true, root: false });

  const cardBox = await card(page).boundingBox();
  const viewport = page.viewportSize();
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0), "the card fits the window").toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(await scrollsSideways(page)).toBe(false);
});

test("should show one box without tabs in the component gallery", async ({ page }) => {
  await page.goto("/dev/components");
  // The gallery hydrates only once its Mermaid diagrams have drawn, seconds after the page loads on a busy runner, and the box's editor cannot load before that.
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
  // The box's editor loads as it nears the window; until then a plain box of the same size holds its place.
  await page.locator("[data-slot=comment-box-plain]").first().scrollIntoViewIfNeeded();
  const box = page.getByRole("textbox", { name: "Write a comment" }).first();
  await expect(box).toHaveAttribute("contenteditable", "true");
  await expectNoTabs(page);
});

test("should show no Write or Preview tab in the workspace's Comments dialog", async ({ page }) => {
  await page.goto("/dev/workspace");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: /Long markdown fixture/ }).click();
  await page.getByRole("button", { name: "Comments" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: /^Comments on / })).toBeVisible();
  await expectNoTabs(page);
});
