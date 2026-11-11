import { expect, test, type Locator, type Page } from "@playwright/test";

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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  expect(errors).toEqual([]);
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
