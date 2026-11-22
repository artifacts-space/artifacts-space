import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/*
 * A code block's surface and tools, in the read view and the editor, on the
 * dev fixture (/dev/mermaid): the block's fill differs from the page around
 * it, and its tools (the language, Copy, and in the editor the pickers, Wrap
 * code, and Caption) sit over its top right, hidden at rest and shown on
 * hover, on keyboard focus, while a picker is open, and always on a touch
 * screen (src/components/code/code-tools.ts).
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

/** Turns the editor's diagram into a plain code block and returns it. */
async function editorCodeBlock(page: Page) {
  const diagram = editor(page).locator("[data-mermaid-block]");
  await diagram.scrollIntoViewIfNeeded();
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
});
