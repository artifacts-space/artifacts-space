import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expectScrollersSettled, unreachableScrollersIn } from "./support/scrollers";

/*
 * A box that scrolls must be reachable by keyboard, or its hidden part
 * cannot be scrolled into view without a pointer. While it scrolls it is a
 * named group and a tab stop; while its content fits it is neither. These
 * drive each such box in a diagram, a chart's table, and a source listing
 * into overflow and back, and check the keyboard can scroll it.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery is ready once React has hydrated it, which its ready mark says. */
async function galleryReady(page: Page, group: string) {
  await page.goto(`/dev/components#${group}`);
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
}

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
  await galleryReady(page, "Diagram");
  const flow = specimen(page, "Diagram", "Flowchart");
  await flow.scrollIntoViewIfNeeded();
  const frame = flow.locator("[data-diagram-frame]");
  await expect(frame).toHaveAttribute("data-diagram-drawn", "");

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
  await galleryReady(page, "Diagram");
  const broken = specimen(page, "Diagram", "Broken source");
  await broken.scrollIntoViewIfNeeded();
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

test("should make a chart's table a named tab stop the keyboard can scroll while it is shown and longer than its frame", async ({ page }) => {
  await galleryReady(page, "Chart");
  const chart = specimen(page, "Chart", "Huge values, 200 points");
  await chart.scrollIntoViewIfNeeded();
  // Hidden for screen readers behind the chart: no tab stop.
  await expect(chart.getByRole("group", { name: "Chart data" })).toHaveCount(0);

  await chart.getByRole("button", { name: "Table" }).click();
  const stop = chart.getByRole("group", { name: "Chart data" });
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expect(stop.getByRole("table")).toBeVisible();
  await expectKeyboardScrolls(page, stop, "ArrowDown");
  await expect.poll(() => unreachableScrollersIn(chart)).toEqual([]);
  await expectNoAxeViolations(chart);

  await chart.getByRole("button", { name: "Chart" }).click();
  await expect(chart.getByRole("group", { name: "Chart data" })).toHaveCount(0);
});

test("should make an SVG's source a named tab stop while it scrolls, when the SVG cannot be shown", async ({ page }) => {
  await galleryReady(page, "formats");
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
  await expect(drawn).toHaveAttribute("data-diagram-state", "drawn");
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
