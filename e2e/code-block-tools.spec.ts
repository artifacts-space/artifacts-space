import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/*
 * A code block's surface and tools, in the read view and the editor, on the
 * dev fixture (/dev/mermaid): the block's fill differs from the page around
 * it, and its tools (the language, Copy, and in the editor the pickers, Wrap
 * code, and Caption) sit over its top right, hidden at rest and shown on
 * hover, on keyboard focus, while a picker is open, and always on a touch
 * screen, taking no presses while hidden (src/components/code/code-tools.ts).
 */

const readView = (page: Page) => page.getByRole("region", { name: "Read view" });
const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const readBlock = (page: Page) => readView(page).locator("[data-code-block]").filter({ hasText: "const answer" });

const opacityOf = (target: Locator) => target.evaluate((element) => getComputedStyle(element).opacity);
const backgroundOf = (target: Locator) => target.evaluate((element) => getComputedStyle(element).backgroundColor);

async function openFixture(page: Page) {
  await page.goto("/dev/mermaid");
  await expect(readView(page).getByRole("heading", { name: "Diagram fixture" })).toBeVisible();
  // Diagrams draw as they near the viewport and move the page; let each finish, so none moves a block from under the pointer.
  for (const diagram of await readView(page).locator("[data-markdown-diagram]").all()) {
    await diagram.scrollIntoViewIfNeeded();
    await expect(diagram).not.toHaveAttribute("data-diagram-state", "drawing", { timeout: 60_000 });
  }
}

/** The editor's Mermaid block, in Preview (the default), once its diagram is drawn. */
async function editorDiagramBlock(page: Page) {
  const block = editor(page).locator("[data-mermaid-block]");
  await block.scrollIntoViewIfNeeded();
  await expect(block).toHaveAttribute("data-diagram-state", "drawn", { timeout: 60_000 });
  return block;
}

/** Turns the editor's diagram into a plain code block and returns it. */
async function editorCodeBlock(page: Page) {
  const diagram = editor(page).locator("[data-mermaid-block]");
  await diagram.scrollIntoViewIfNeeded();
  // The tools take presses only while they show, as a person's pointer over the block makes them.
  await diagram.hover();
  await diagram.getByRole("combobox", { name: "Code language" }).click();
  await page.getByRole("option", { name: "Plain text" }).click();
  const block = editor(page).locator(".rich-code-block").filter({ hasText: "Plan --> Build" });
  await expect(block).toBeVisible();
  return block;
}

test("should fill a code block with a color other than the page's when it is drawn", async ({ page }) => {
  await openFixture(page);
  const block = readBlock(page);
  const pageFill = await backgroundOf(page.locator("body"));
  expect(await backgroundOf(block)).not.toBe(pageFill);
  // The tools are a chip off what is under them, the code's fill or a diagram's card, so they and their buttons' hover fill (--muted, the code fill's own step) show on both.
  const diagram = await editorDiagramBlock(page);
  const toolsFill = await backgroundOf(block.locator("[data-code-tools]"));
  expect(toolsFill).not.toBe(await backgroundOf(block));
  expect(await backgroundOf(diagram.locator("[data-code-tools]"))).not.toBe(await backgroundOf(diagram.locator("[data-diagram-pane]")));
  expect(await backgroundOf((await editorCodeBlock(page)).locator(".rich-code-frame"))).toBe(await backgroundOf(block));
});

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "Touch screens always show the tools.");

  test("should show a read block's tools only while it is hovered or holds focus", async ({ page }) => {
    await openFixture(page);
    const block = readBlock(page);
    const tools = block.locator("[data-code-tools]");
    await block.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(tools)).toBe("0");

    await block.hover();
    await expect.poll(() => opacityOf(tools)).toBe("1");

    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(tools)).toBe("0");
    await block.getByRole("button", { name: "Copy code" }).focus();
    await expect.poll(() => opacityOf(tools)).toBe("1");
  });

  test("should let a press reach the code under a block's tools while they are hidden", async ({ page }) => {
    await openFixture(page);
    const block = readBlock(page);
    const tools = block.locator("[data-code-tools]");
    await block.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(tools)).toBe("0");
    const bar = await tools.boundingBox();
    if (!bar) throw new Error("the tools have no box");
    const hitsTools = () => page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[data-code-tools]")), { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 });
    expect(await hitsTools()).toBe(false);

    await block.hover();
    await expect.poll(hitsTools).toBe(true);
  });

  test("should keep the editor's tools showing while the language menu is open, after the pointer leaves", async ({ page }) => {
    await openFixture(page);
    const block = await editorCodeBlock(page);
    const tools = block.locator("[data-code-tools]");
    await editor(page).getByText("Intro paragraph.").click();
    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(tools)).toBe("0");

    await block.hover();
    await block.getByRole("combobox", { name: "Code language" }).click();
    await expect(page.getByRole("option", { name: "Plain text" })).toBeVisible();
    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(tools)).toBe("1");
  });
});

test("should end a titled block's title before its tools when they show", async ({ page }) => {
  await page.goto("/docs/clients");
  const block = page.locator("figure[data-code-block]").filter({ has: page.locator("figcaption", { hasText: "mcp.json" }) }).first();
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  const tools = block.locator("[data-code-tools]");
  await expect.poll(() => opacityOf(tools)).toBe("1");

  const title = await block.locator("figcaption").boundingBox();
  const bar = await tools.boundingBox();
  if (!title || !bar) throw new Error("the title or the tools have no box");
  // The title's whole line, not only its words, stops short of the tools, so a long title truncates instead of running under them.
  expect(title.x + title.width).toBeLessThanOrEqual(bar.x);
});

test.describe("on a touch screen", () => {
  test.skip(({ isMobile }) => !isMobile, "Only touch screens show the tools at rest.");

  test("should always show a code block's tools when the screen has no hover", async ({ page }) => {
    await openFixture(page);
    await expect.poll(() => opacityOf(readBlock(page).locator("[data-code-tools]"))).toBe("1");
    await expect.poll(async () => opacityOf((await editorCodeBlock(page)).locator("[data-code-tools]"))).toBe("1");
  });

  test("should start the code below the tools when they always show, so none of it is covered", async ({ page }) => {
    await openFixture(page);
    const read = readBlock(page);
    const edited = await editorCodeBlock(page);
    for (const [block, code] of [[read, read.locator("code")], [edited, edited.locator("pre code")]] as const) {
      const tools = await block.locator("[data-code-tools]").boundingBox();
      const first = await code.boundingBox();
      if (!tools || !first) throw new Error("the tools or the code have no box");
      expect(first.y).toBeGreaterThanOrEqual(tools.y + tools.height);
    }
  });

  test("should start a diagram below the tools when they always show, so none of it is covered", async ({ page }) => {
    await openFixture(page);
    const block = await editorDiagramBlock(page);
    const tools = await block.locator("[data-code-tools]").boundingBox();
    const drawing = await block.locator("[data-diagram-pane] svg").first().boundingBox();
    if (!tools || !drawing) throw new Error("the tools or the drawing have no box");
    expect(drawing.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  });

  test("should start a wide Split's diagram below the tools when they always show, so none of it is covered", async ({ page }) => {
    // A wide window gives the block room to set its two sides side by side, with the diagram on the right, under the tools.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);
    const block = await editorDiagramBlock(page);
    await block.getByRole("combobox", { name: "Diagram view" }).click();
    await page.getByRole("option", { name: "Split", exact: true }).click();
    const pane = block.locator("[data-diagram-pane]");
    // The source side is the pre beside the diagram side, not any pre the diagram side may hold.
    const source = await pane.locator("xpath=preceding-sibling::pre").boundingBox();
    const side = await pane.boundingBox();
    if (!source || !side) throw new Error("the source or the diagram side has no box");
    // The sides sit in one row, the diagram on the right.
    expect(side.x).toBeGreaterThanOrEqual(source.x + source.width - 1);
    expect(Math.abs(side.y - source.y)).toBeLessThanOrEqual(1);

    const tools = await block.locator("[data-code-tools]").boundingBox();
    const drawing = await pane.locator("svg").first().boundingBox();
    if (!tools || !drawing) throw new Error("the tools or the drawing have no box");
    expect(drawing.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  });
});
