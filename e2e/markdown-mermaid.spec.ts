import { expect, test, type Page } from "@playwright/test";

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

async function openFixture(page: Page) {
  await page.goto("/dev/mermaid");
  await expect(readView(page).getByRole("heading", { name: "Diagram fixture" })).toBeVisible();
  // Diagrams draw as they near the viewport; the first one is on screen.
  await expect(readDiagrams(page).first()).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
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

test("should open the source under a live preview and keep the fenced block when a diagram is edited", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  await expect(block.locator("pre")).toBeHidden();
  const before = await block.getByRole("img", { name: "Diagram" }).getAttribute("src");

  await block.getByRole("button", { name: "Edit diagram" }).click();
  await expect(block).toHaveAttribute("data-source-open", "");
  await expect(block.locator("pre")).toBeVisible();
  await expect(block.getByRole("img", { name: "Diagram" })).toBeVisible();

  await page.keyboard.press("Enter");
  await page.keyboard.type("  Build --> Ship");
  await expect(savedMarkdown(page)).toContainText("```mermaid\nflowchart LR\n  Plan --> Build\n  Build --> Ship\n```");
  await expect(block.getByRole("img", { name: "Diagram" })).not.toHaveAttribute("src", before ?? "", { timeout: 30_000 });
  expect(await svgOf(page, await block.getByRole("img", { name: "Diagram" }).getAttribute("src"))).toContain("Ship");

  // A selection that starts in the source and runs past it keeps the source open.
  await page.keyboard.press("Control+Shift+End");
  await expect(block.locator("pre")).toBeVisible();

  await block.getByRole("button", { name: "Done" }).click();
  await expect(block).not.toHaveAttribute("data-source-open", "");
  await expect(block.locator("pre")).toBeHidden();
  await expect(savedMarkdown(page)).toContainText("# Editor diagram\n\nIntro paragraph.\n\n```mermaid\nflowchart LR\n  Plan --> Build\n  Build --> Ship\n```\n\nEnd paragraph.");
});

test("should keep the source open with the note when an edit breaks the diagram", async ({ page }) => {
  await openFixture(page);
  const block = await editorBlock(page);
  // A click on the diagram itself opens its source, with the cursor at the end.
  await block.getByRole("img", { name: "Diagram" }).click();
  await page.keyboard.type(" -- >");
  await expect(block).toHaveAttribute("data-diagram-state", "failed", { timeout: 30_000 });
  await expect(block.getByRole("note")).toContainText("Couldn’t draw this diagram.");

  // Moving the cursor out leaves the source open, so the mistake can be fixed.
  await editor(page).getByText("End paragraph.").click();
  await expect(block.locator("pre")).toBeVisible();
});
