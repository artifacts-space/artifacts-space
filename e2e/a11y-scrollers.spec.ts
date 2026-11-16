import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";
import { openGallery, specimen } from "./support/gallery";
import { diagramDrawTimeout, expectDiagramsSettled, expectScrollersSettled, unreachableScrollersIn } from "./support/scrollers";

/*
 * A box that scrolls must be reachable by keyboard, or its hidden part
 * cannot be scrolled into view without a pointer. While it scrolls it is a
 * named group and a tab stop; while its content fits it is neither. These
 * drive each such box in a diagram, a chart's table, and a source listing
 * into overflow and back, and check the keyboard can scroll it.
 */

const scrollOf = (target: Locator) => target.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));

/** Sets inline styles on an element, as a narrower page or a shorter frame would size it. */
const restyle = (target: Locator, styles: Record<string, string>) =>
  target.evaluate((element: HTMLElement, values) => { Object.assign(element.style, values); }, styles);

/** Focuses a scrolling box from the keyboard's side and presses `key` until it has scrolled. */
async function expectKeyboardScrolls(page: Page, frame: Locator, key: "ArrowRight" | "ArrowDown") {
  await frame.focus();
  await expect(frame).toBeFocused();
  const axis = key === "ArrowRight" ? "left" : "top";
  await expect.poll(async () => {
    await page.keyboard.press(key);
    return (await scrollOf(frame))[axis];
  }).toBeGreaterThan(0);
}

test("should make a diagram that is wider than its frame a named tab stop the keyboard can scroll, and nothing once it fits", async ({ page, isMobile }) => {
  await openGallery(page, ["Diagram/Flowchart"]);
  const flow = specimen(page, "Diagram", "Flowchart");
  await flow.scrollIntoViewIfNeeded();
  await expect(flow.locator("[data-diagram-state]")).toHaveAttribute("data-diagram-state", "drawn", { timeout: diagramDrawTimeout });
  const frame = flow.locator("[data-diagram-frame]");

  // Narrower than the drawing can shrink while its text stays readable: the frame scrolls sideways.
  await restyle(flow, { width: "160px" });
  const stop = flow.getByRole("group", { name: "Request flow" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expectKeyboardScrolls(page, stop, "ArrowRight");
  await expectScrollersSettled(flow);
  await expectNoAxeViolations(flow);

  // As wide as the page again. On a desktop the drawing fits there, and the frame is no extra tab stop; on a
  // phone it is still wider than the page, so it stays one. Either way nothing that scrolls is out of reach.
  await restyle(flow, { width: "" });
  await expect.poll(() => unreachableScrollersIn(flow)).toEqual([]);
  if (isMobile) return;
  await expect(frame).not.toHaveAttribute("tabindex");
  await expect(frame).not.toHaveAttribute("role");
});

test("should make a failed diagram's source a named tab stop while it scrolls", async ({ page }) => {
  await openGallery(page, ["Diagram/Broken source"]);
  const broken = specimen(page, "Diagram", "Broken source");
  await broken.scrollIntoViewIfNeeded();
  // The notice shows once Mermaid has loaded and tried to draw, which starts only after the page is ready.
  await expect(broken.locator("[data-diagram-state]")).toHaveAttribute("data-diagram-state", "failed", { timeout: diagramDrawTimeout });
  await expect(broken.getByText("This diagram could not be drawn.")).toBeVisible();
  const source = broken.locator("pre").locator("xpath=..");
  // A short source fits: no tab stop.
  await expect(source).not.toHaveAttribute("tabindex");
  // A source longer than its frame scrolls down.
  await restyle(source, { maxHeight: "1.5rem" });
  const stop = broken.getByRole("group", { name: "Diagram source" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expectKeyboardScrolls(page, stop, "ArrowDown");
  await expectNoAxeViolations(broken);
});

test("should make a chart's table a tab stop named from the chart's title, which the keyboard can scroll while it is shown and longer than its frame", async ({ page }) => {
  await openGallery(page, ["Chart/Huge values, 200 points"]);
  const chart = specimen(page, "Chart", "Huge values, 200 points");
  await chart.scrollIntoViewIfNeeded();
  // Hidden for screen readers behind the chart: no tab stop.
  await expect(chart.getByRole("group", { name: "Huge values data" })).toHaveCount(0);

  await chart.getByRole("button", { name: "Table" }).click();
  const stop = chart.getByRole("group", { name: "Huge values data" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expect(stop.getByRole("table")).toBeVisible();
  await expectKeyboardScrolls(page, stop, "ArrowDown");
  await expect.poll(() => unreachableScrollersIn(chart)).toEqual([]);
  await expectNoAxeViolations(chart);

  await chart.getByRole("button", { name: "Chart" }).click();
  await expect(chart.getByRole("group", { name: "Huge values data" })).toHaveCount(0);
});

test("should name the table of a chart without a title \"Chart data\"", async ({ page }) => {
  await openGallery(page, ["Chart/Stacked bars, 8 series, 24 labels"]);
  const chart = specimen(page, "Chart", "Stacked bars, 8 series, 24 labels");
  await chart.scrollIntoViewIfNeeded();
  await chart.getByRole("button", { name: "Table" }).click();
  await expect(chart.getByRole("group", { name: "Chart data" })).toHaveAttribute("tabindex", "0");
});

test("should make an SVG's source a named tab stop while it scrolls, when the SVG cannot be shown", async ({ page }) => {
  await openGallery(page, ["formats/svg · SVG, invalid"]);
  const invalid = specimen(page, "formats", "svg · SVG, invalid");
  await invalid.scrollIntoViewIfNeeded();
  await expect(invalid.getByText("This SVG could not be shown.")).toBeVisible();
  const source = invalid.locator("pre").locator("xpath=..");
  await expect(source).not.toHaveAttribute("tabindex");
  await restyle(source, { maxHeight: "0.75rem" });
  const stop = invalid.getByRole("group", { name: "SVG source" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expectKeyboardScrolls(page, stop, "ArrowDown");
  await expectNoAxeViolations(invalid);
});

test("should make a zoomed diagram a named tab stop while it is larger than the dialog", async ({ page }) => {
  await page.goto("/dev/mermaid");
  const readView = page.getByRole("region", { name: "Read view" });
  const drawn = readView.locator("[data-markdown-diagram]").first();
  await expect(drawn).toHaveAttribute("data-diagram-state", "drawn", { timeout: diagramDrawTimeout });
  await drawn.getByRole("button", { name: "Zoom in" }).click();
  const dialog = page.getByRole("dialog", { name: "Diagram" });
  await expect(dialog.getByRole("img", { name: "Diagram" })).toBeVisible();
  // Whatever the window, a frame that scrolls is a tab stop and one that fits is not.
  await expect.poll(() => unreachableScrollersIn(dialog)).toEqual([]);

  // Larger than any window: it scrolls both ways.
  await restyle(dialog.locator("img[data-diagram-zoom]"), { width: "3000px" });
  const stop = dialog.getByRole("group", { name: "Diagram" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expectKeyboardScrolls(page, stop, "ArrowRight");
  await expectNoAxeViolations(dialog);
});

test("should leave no box that scrolls out of the keyboard's reach on the diagram docs page", async ({ page }) => {
  await page.goto("/docs/json-render/components/diagram");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^diagram$/i);
  const examples = page.locator(".\\@container\\/ui");
  expect(await examples.count()).toBeGreaterThan(0);
  for (const example of await examples.all()) {
    await example.scrollIntoViewIfNeeded();
    await expectScrollersSettled(example);
  }
  await expect(async () => {
    await expectNoAxeViolations(page, {
      skip: {
        "scrollable-region-focusable": {
          on: "details:not([open]) pre",
          reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
        },
      },
    });
  }).toPass({ timeout: 20_000 });
});

test("should fail the diagram wait with words that name a diagram that never draws, before the test's own time runs out", async ({ page }) => {
  await page.setContent('<section data-specimen="Never drawn"><figure><figcaption>Release flow</figcaption><div data-diagram-state="drawing">flowchart LR</div></figure></section>');
  const limit = test.info().timeout;
  const wait = () => expectDiagramsSettled(page.locator("body"), 500).then(() => "it settled", (error: unknown) => (error instanceof Error ? error.message : String(error)));
  expect(await wait()).toBe('Still drawing after 0.5 s: specimen "Never drawn", caption "Release flow", words "flowchart LR"');
  // A second wait in the same test does not grow its time limit again.
  await wait();
  expect(test.info().timeout).toBe(limit + diagramDrawTimeout);
});
