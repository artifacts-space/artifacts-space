import type { Locator, Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * Mermaid diagrams in Markdown documents, on the dev fixture (/dev/mermaid,
 * src/components/dev/mermaid-fixture.tsx): a fenced mermaid block draws as
 * an SVG diagram in the read view and the editor, a broken one shows its
 * source with a short note, and editing the source keeps the Markdown the
 * fenced block (src/components/editor/rich/markdown-dialect.md).
 */

const readView = (page: Page) => page.getByRole("region", { name: "Read view" });
const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");
const readDiagrams = (page: Page) => readView(page).locator("[data-markdown-diagram]");
const editorDiagram = (page: Page) => editor(page).locator("[data-mermaid-block]");
/** A diagram block's editable source: the code block holding the editor's own text. */
const sourceOf = (block: Locator) => block.locator("pre:has([data-node-view-content])");

async function openFixture(page: Page) {
  await page.goto("/dev/mermaid");
  await expect(readView(page).getByRole("heading", { name: "Diagram fixture" })).toBeVisible();
  // Diagrams draw as they near the viewport. Let every read-view diagram finish, so none moves the page under a later click.
  for (const diagram of await readDiagrams(page).all()) {
    await diagram.scrollIntoViewIfNeeded();
    await expect(diagram).not.toHaveAttribute("data-diagram-state", "drawing", { timeout: 60_000 });
  }
  await page.evaluate(() => { window.scrollTo(0, 0); });
}

/** Scrolls the editor's diagram into view, where it draws, and returns it. */
async function editorBlock(page: Page) {
  const block = editorDiagram(page);
  await block.scrollIntoViewIfNeeded();
  await expect(block).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
  return block;
}

/** The decoded SVG behind a diagram image, so the test can check it really is a drawn diagram. */
async function svgOf(page: Page, src: string | null): Promise<string> {
  expect(src).toMatch(/^data:image\/svg\+xml/u);
  return page.evaluate(async (url) => (await fetch(url)).text(), src ?? "");
}

test("should draw a fenced mermaid block as an SVG diagram that fits the page when a document has one", async ({ page }) => {
  await openFixture(page);

  const drawn = readDiagrams(page).first();
  await expect(drawn).toHaveAttribute("data-diagram-state", "drawn");
  const image = drawn.getByRole("img", { name: "Diagram" });
  await expect(image).toBeVisible();
  const svg = await svgOf(page, await image.getAttribute("src"));
  expect(svg).toContain("<svg");
  expect(svg).toContain("Publish");
  expect(svg).not.toContain("<script");

  // The source never shows as code, and other fences stay code blocks.
  await expect(drawn.locator("[data-code-block]")).toHaveCount(0);
  // Screen readers get the source as text after the image.
  await expect(drawn.locator(".sr-only pre")).toHaveText(/^flowchart TD\n {2}A\[Agent drafts\]/u);
  await expect(readView(page).locator("[data-code-block]").filter({ hasText: "const answer = 42;" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("should show the source with a short note when a diagram cannot be drawn", async ({ page }) => {
  await openFixture(page);
  const broken = readDiagrams(page).nth(1);
  await broken.scrollIntoViewIfNeeded();
  await expect(broken).toHaveAttribute("data-diagram-state", "failed");
  await expect(broken.getByRole("note")).toContainText("Couldn’t draw this diagram.");
  await expect(broken.locator("[data-code-block]")).toContainText("A -- > B");
  await expect(broken.locator("img")).toHaveCount(0);
});

test("should redraw the diagram in dark colors when the reader switches to dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openFixture(page);
  const image = readDiagrams(page).first().getByRole("img", { name: "Diagram" });
  const light = await image.getAttribute("src");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await expect(image).not.toHaveAttribute("src", light ?? "", { timeout: 30_000 });
  await expect(readDiagrams(page).first()).toHaveAttribute("data-diagram-state", "drawn");
});

/** Picks a view from a diagram block's view picker. */
async function pickView(page: Page, block: Locator, view: "Code" | "Preview" | "Split") {
  await block.getByRole("combobox", { name: "Diagram view" }).click();
  await page.getByRole("option", { name: view, exact: true }).click();
}

/**
 * Clicks into the editor and waits for it to take the click's cursor:
 * ProseMirror reads the browser's selection a moment after the mouse comes
 * up, and a key pressed before then lands at the old cursor.
 */
async function clickInEditor(target: Locator, options: Parameters<Locator["click"]>[0] = {}) {
  await target.click(options);
  await target.page().evaluate(() => new Promise((resolve) => { setTimeout(resolve, 100); }));
}

/** Puts the cursor at the end of a diagram's source: a click right of its last line (End differs across platforms). */
async function clickSourceEnd(block: Locator) {
  const source = sourceOf(block);
  const box = await source.boundingBox();
  if (!box) throw new Error("the source should be on screen");
  await clickInEditor(source, { position: { x: box.width - 6, y: box.height - 26 } });
}

/** True when `second` sits to the right of `first` (side by side), false when it sits below (stacked). */
async function sideBySide(first: Locator, second: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!a || !b) throw new Error("both sides should be on screen");
  return b.x >= a.x + a.width - 1 && Math.abs(b.y - a.y) < a.height;
}

test("should show only the source when a diagram's view is code, and both with the caption when it is split", async ({ page, isMobile }) => {
  await openFixture(page);
  const codeOnly = readView(page).locator('[data-markdown-mermaid][data-diagram-view="code"]');
  await codeOnly.scrollIntoViewIfNeeded();
  await expect(codeOnly.locator("[data-code-block]")).toContainText("Source --> Only");
  await expect(codeOnly.getByRole("img", { name: "Diagram" })).toHaveCount(0);

  const split = readView(page).locator('[data-markdown-mermaid][data-diagram-view="split"]');
  await split.scrollIntoViewIfNeeded();
  await expect(split.locator("[data-markdown-diagram]")).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
  const source = split.locator("[data-code-block]");
  const diagram = split.getByRole("img", { name: "Diagram" });
  await expect(source).toContainText("Review --> Ship");
  await expect(diagram).toBeVisible();
  // Side by side on a desktop; stacked, source first, on a phone.
  expect(await sideBySide(source, diagram)).toBe(!isMobile);
  await expect(split.locator("[data-block-caption]")).toHaveText('Say "ship" when it is ready');

  const wrapped = readView(page).locator("[data-code-figure]");
  await expect(wrapped.locator("[data-block-caption]")).toHaveText("Build output");
  await expect(wrapped.locator("pre")).toHaveClass(/whitespace-pre-wrap/u);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("should open a diagram larger when a reader clicks it", async ({ page }) => {
  await openFixture(page);
  const drawn = readDiagrams(page).first();
  await drawn.getByRole("img", { name: "Diagram" }).click();
  const dialog = page.getByRole("dialog", { name: "Diagram" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Diagram" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await drawn.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog).toBeVisible();
});

/**
 * Opens the editor's diagram larger with a click, checks that it stays open
 * and that the block's view is the one that was clicked, then closes it with
 * `close` and checks the focus is back on the diagram's Zoom in.
 */
async function expectOpensLargerInEditor(page: Page, block: Locator, close: "Escape" | "Close") {
  const clicked = await block.elementHandle();
  await clickInEditor(block.getByRole("img", { name: "Diagram" }));
  const dialog = page.getByRole("dialog", { name: "Diagram" });
  await expect(dialog.getByRole("img", { name: "Diagram" })).toBeVisible();
  // The editor never drew the block again under the dialog: that took the dialog with it (issue #226).
  expect(await clicked.evaluate((element) => element.isConnected)).toBe(true);
  await expect(dialog).toBeVisible();
  if (close === "Escape") await page.keyboard.press("Escape");
  else await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  const zoom = block.getByRole("button", { name: "Zoom in" });
  await expect(zoom).toBeFocused();
  // It shows while it has the focus, after a close with the pointer too.
  await page.mouse.move(0, 0);
  await expect(zoom).toHaveCSS("opacity", "1");
}

test("should open a diagram larger in the editor and keep it open until it is closed, in Preview and in Split", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  // A live region inside the editor's text makes a modal dialog write aria-hidden onto the editor's blocks, and ProseMirror then draws them again (editor-live-region.tsx).
  await expect(editor(page).locator("[aria-live]")).toHaveCount(0);
  await expectOpensLargerInEditor(page, block, "Escape");
  await expect(sourceOf(block)).toBeHidden();

  await pickView(page, block, "Split");
  await expect(sourceOf(block)).toBeVisible();
  await expectOpensLargerInEditor(page, block, "Close");
  // Opening and closing changed nothing in the document.
  await expect(savedMarkdown(page)).toContainText("```mermaid {view=split}\nflowchart LR\n  Plan --> Build\n```");
});

test("should say Copied through the editor's own live region, beside its text, when a diagram's source is copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openFixture(page);
  const block = await editorBlock(page);
  await block.hover();
  await block.getByRole("button", { name: "Copy code" }).click();
  await expect(page.locator("[data-editor-live-region]")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("flowchart LR\n  Plan --> Build");
  await expect(editor(page).locator("[aria-live]")).toHaveCount(0);
});

test("should show the diagram alone, keeping its source in place, when the view is preview", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await expect(block).toHaveAttribute("data-diagram-view", "preview");
  await expect(sourceOf(block)).toBeHidden();
  // While the source is hidden, screen readers get it after the diagram.
  await expect(block.locator(".sr-only pre")).toHaveText("flowchart LR\n  Plan --> Build");
  await expect(block.getByRole("combobox", { name: "Code language" })).toHaveText(/Mermaid diagram/u);
  await expect(block.getByRole("combobox", { name: "Diagram view" })).toHaveText(/Preview/u);
});

test("should save the view in the fence and redraw as the source changes when Split is picked", async ({ page, isMobile }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  const before = await block.getByRole("img", { name: "Diagram" }).getAttribute("src");

  await pickView(page, block, "Split");
  await expect(savedMarkdown(page)).toContainText("```mermaid {view=split}\nflowchart LR\n  Plan --> Build\n```");
  await expect(sourceOf(block)).toBeVisible();
  const diagram = block.getByRole("img", { name: "Diagram" });
  await expect(diagram).toBeVisible();
  expect(await sideBySide(sourceOf(block), diagram)).toBe(!isMobile);

  await clickSourceEnd(block);
  await page.keyboard.press("Enter");
  await page.keyboard.type("  Build --> Ship");
  await expect(savedMarkdown(page)).toContainText("```mermaid {view=split}\nflowchart LR\n  Plan --> Build\n  Build --> Ship\n```");
  await expect(diagram).not.toHaveAttribute("src", before ?? "", { timeout: 30_000 });
  expect(await svgOf(page, await diagram.getAttribute("src"))).toContain("Ship");

  await pickView(page, block, "Code");
  await expect(savedMarkdown(page)).toContainText("```mermaid {view=code}\n");
  await expect(sourceOf(block)).toBeVisible();
  await expect(block.getByRole("img", { name: "Diagram" })).toBeHidden();

  // Preview is the default, so picking it leaves the fence plain.
  await pickView(page, block, "Preview");
  await expect(savedMarkdown(page)).toContainText("Intro paragraph.\n\n```mermaid\nflowchart LR\n  Plan --> Build\n  Build --> Ship\n```\n\nEnd paragraph.");
});

test("should save a caption and wrapping in the fence when an editor adds them", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await block.getByRole("button", { name: "Caption" }).click();
  const caption = block.getByRole("textbox", { name: "Caption" });
  await expect(caption).toBeFocused();
  await caption.fill('The "build" path');
  await caption.press("Enter");
  await expect(savedMarkdown(page)).toContainText('```mermaid {caption="The \\"build\\" path"}\nflowchart LR');
  await expect(block.getByRole("button", { name: "Caption" })).toHaveCount(0);

  await block.getByRole("button", { name: "Wrap code" }).click();
  await expect(block.getByRole("button", { name: "Wrap code" })).toHaveAttribute("aria-pressed", "true");
  await expect(savedMarkdown(page)).toContainText('```mermaid {caption="The \\"build\\" path" wrap=true}\n');

  await caption.fill("");
  await caption.press("Enter");
  await expect(savedMarkdown(page)).toContainText("```mermaid {wrap=true}\n");
});

test("should keep the source showing with the note when an edit breaks a diagram in preview", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await pickView(page, block, "Split");
  await clickSourceEnd(block);
  await page.keyboard.type(" -- >");
  await expect(block).toHaveAttribute("data-diagram-state", "failed", { timeout: 30_000 });
  await expect(block.getByRole("note")).toContainText("Couldn’t draw this diagram.");

  // Back in Preview, a broken diagram keeps its source showing, so the mistake can be fixed.
  await pickView(page, block, "Preview");
  await editor(page).getByText("End paragraph.").click();
  await expect(block).toHaveAttribute("data-diagram-view", "preview");
  await expect(sourceOf(block)).toBeVisible();
});

test("should turn a diagram back into a code block when Plain text is picked", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await block.getByRole("combobox", { name: "Code language" }).click();
  await page.getByRole("option", { name: "Plain text" }).click();

  await expect(editorDiagram(page)).toHaveCount(0);
  await expect(editor(page).locator("pre").filter({ hasText: "Plan --> Build" })).toBeVisible();
  await expect(savedMarkdown(page)).toContainText("Intro paragraph.\n\n```\nflowchart LR\n  Plan --> Build\n```\n\nEnd paragraph.");
});

test("should draw an editor code block in the read view's code font, size, and line height, smaller than the text", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await block.getByRole("combobox", { name: "Code language" }).click();
  await page.getByRole("option", { name: "Plain text" }).click();

  const fontOf = (target: Locator) => target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight };
  });
  const editorCode = await fontOf(editor(page).locator("pre").filter({ hasText: "Plan --> Build" }));
  const readCode = await fontOf(readView(page).locator("[data-code-block] pre").filter({ hasText: "const answer" }));
  const paragraph = await fontOf(editor(page).getByText("Intro paragraph."));

  expect(editorCode).toEqual(readCode);
  expect(Number.parseFloat(editorCode.size)).toBeLessThan(Number.parseFloat(paragraph.size));
});

test("should insert an empty diagram with its source open when Mermaid diagram is picked from the slash menu", async ({ page }) => {
  await openFixture(page);
  await editorBlock(page);
  await clickInEditor(editor(page).getByText("End paragraph."));
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/mermaid");
  await page.getByRole("option", { name: /Mermaid diagram/u }).click();
  await expect(editorDiagram(page)).toHaveCount(2);
  // An empty diagram shows its source, with a hint where the diagram will draw.
  const added = editorDiagram(page).filter({ hasText: "Write Mermaid source" });
  await expect(added).toHaveAttribute("data-source-open", "");
  await expect(sourceOf(added)).toBeVisible();
  await page.keyboard.type("flowchart TD\n  New --> Diagram");
  await expect(savedMarkdown(page)).toContainText("End paragraph.\n\n```mermaid\nflowchart TD\n  New --> Diagram\n```");
});

/*
 * Preview is the diagram alone. The source shows in Preview only while the
 * diagram is empty or broken, or while the cursor is in a source that was
 * already showing (mermaid-block-view.tsx).
 */

test("should show the diagram alone at once, keeping the edit, when Preview is picked with the cursor in the source", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await pickView(page, block, "Split");
  await clickSourceEnd(block);
  await page.keyboard.press("Enter");
  await page.keyboard.type("  Build --> Ship");

  await pickView(page, block, "Preview");
  await expect(block).toHaveAttribute("data-diagram-view", "preview");
  await expect(sourceOf(block)).toBeHidden();
  await expect(block).not.toHaveAttribute("data-source-open", "");
  await expect(block.getByRole("img", { name: "Diagram" })).toBeVisible();
  // The edit made in Split is kept, and the block itself is selected: the cursor is no longer in hidden text.
  await expect(savedMarkdown(page)).toContainText("```mermaid\nflowchart LR\n  Plan --> Build\n  Build --> Ship\n```");
  await expect(editor(page).locator(".ProseMirror-selectednode [data-mermaid-block]")).toHaveCount(1);
  // The picker keeps the keyboard, so the view can be changed again at once.
  const picker = block.getByRole("combobox", { name: "Diagram view" });
  await expect(picker).toBeFocused();
  await expect(picker).toHaveText(/Preview/u);
  await expectNoAxeViolations(block);

  await pickView(page, block, "Split");
  await expect(sourceOf(block)).toBeVisible();
  await expect(sourceOf(block)).toContainText("Build --> Ship");
});

test("should keep the diagram alone in Preview when it is clicked and when everything is selected", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await clickInEditor(block.getByRole("img", { name: "Diagram" }));
  // The click opens the diagram larger; behind the dialog the editor is hidden from the accessibility tree, so close it first.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Diagram" })).toBeHidden();
  // A click on the diagram never opens the source.
  await expect(sourceOf(block)).toBeHidden();
  await expect(block).not.toHaveAttribute("data-source-open", "");

  await clickInEditor(editor(page).getByText("End paragraph."));
  await page.keyboard.press("ControlOrMeta+a");
  // The selection reached the editor and covers the block: it is outlined, because the next key would replace it.
  await expect(block).toHaveAttribute("data-selection-over", "");
  const outline = await block.evaluate((element) => { const style = getComputedStyle(element); return `${style.outlineWidth} ${style.outlineStyle}`; });
  expect(outline).toBe("2px solid");
  await expect(sourceOf(block)).toBeHidden();
  await expect(block).not.toHaveAttribute("data-source-open", "");

  await clickInEditor(editor(page).getByText("End paragraph."));
  await expect(block).not.toHaveAttribute("data-selection-over", "");
});

test("should pass over a diagram in Preview with the arrow keys and never type into its hidden source", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await clickInEditor(editor(page).getByText("Intro paragraph."));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("X");
  // The cursor went from the paragraph above the diagram to the one below it (which end of it differs across platforms).
  await expect(savedMarkdown(page)).toContainText(/Intro paragraph\.\n\n```mermaid\nflowchart LR\n {2}Plan --> Build\n```\n\n(?:XEnd paragraph\.|End paragraph\.X)/u);
  await expect(sourceOf(block)).toBeHidden();

  await clickInEditor(editor(page).getByText("End paragraph."));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("Y");
  // And from the paragraph below it to the one above.
  await expect(savedMarkdown(page)).toContainText(/(?:YIntro paragraph\.|Intro paragraph\.Y)\n\n```mermaid\nflowchart LR\n {2}Plan --> Build\n```\n\n/u);
  await expect(sourceOf(block)).toBeHidden();
});

test("should keep a new diagram's source in sight while it is typed, and hide it when Preview is picked again", async ({ page }) => {
  await openFixture(page);
  await editorBlock(page);
  await clickInEditor(editor(page).getByText("End paragraph."));
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/mermaid");
  await page.getByRole("option", { name: /Mermaid diagram/u }).click();
  await page.keyboard.type("flowchart TD\n  New --> Diagram");
  const added = editorDiagram(page).nth(1);
  await expect(added).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
  // The cursor is still in the source that was open while the diagram was empty, so what is typed stays in sight.
  await expect(added).toHaveAttribute("data-diagram-view", "preview");
  await expect(sourceOf(added)).toBeVisible();
  await page.keyboard.type("\n  Diagram --> Done");
  await expect(savedMarkdown(page)).toContainText("```mermaid\nflowchart TD\n  New --> Diagram\n  Diagram --> Done\n```");

  // Preview already shows in the picker; picking it again is still a clear choice.
  await pickView(page, added, "Preview");
  await expect(sourceOf(added)).toBeHidden();
  await expect(added.getByRole("img", { name: "Diagram" })).toBeVisible();
  await expect(savedMarkdown(page)).toContainText("  Diagram --> Done\n```");
});

test("should show the source again in Preview when an undo puts the cursor back in it", async ({ page }) => {
  await openFixture(page);
  await editorBlock(page);
  await clickInEditor(editor(page).getByText("End paragraph."));
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/mermaid");
  await page.getByRole("option", { name: /Mermaid diagram/u }).click();
  await page.keyboard.type("flowchart TD\n  New --> Diagram");
  const added = editorDiagram(page).nth(1);
  await expect(added).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
  // A pause, so the next line is its own step to undo (the editor groups typing that follows within half a second).
  await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 700); }));
  await page.keyboard.type("\n  Diagram --> Done");
  await expect(savedMarkdown(page)).toContainText("  Diagram --> Done\n```");
  // The cursor leaves: the diagram shows alone.
  await clickInEditor(editor(page).getByText("Intro paragraph."));
  await expect(sourceOf(added)).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  // The undo took the line out of the source and left the cursor there, so the source is in sight for what is typed next.
  await expect(savedMarkdown(page)).not.toContainText("Diagram --> Done");
  await expect(sourceOf(added)).toBeVisible();
  await page.keyboard.type(" %% Q");
  await expect(sourceOf(added)).toContainText("%% Q");
});
