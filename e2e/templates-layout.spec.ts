import type { Locator, Page } from "@playwright/test";

import { templateFrameWidths } from "../src/lib/ui/templates/frames";
import { findTemplate, uiTemplates } from "../src/lib/ui/templates/index";
import type { UiTemplate } from "../src/lib/ui/templates/types";

import { setFrameWidth } from "./support/template-frames";
import { expect, test } from "./support/test";

/*
 * Layout details of single templates that a reader notices and the shared
 * loops (templates.spec.ts, templates-behavior.spec.ts) cannot see, measured
 * in the frames the page draws (templateFrameWidths). The words to look for
 * come from each template's own fragment, so rewording a template does not
 * break a check. The frames are the same widths in every project, so this
 * runs once, on the desktop.
 */

/** Below this frame width a `stackBelow: "md"` row has stacked (md is 672 pixels). */
const stackedBelow = 672;

const section = (page: Page, id: string) => page.locator(`[data-template="${id}"]:visible`);
const frameAt = (page: Page, id: string, frame: number) => section(page, id).locator(`[data-template-frame="${String(frame)}"]`);

async function open(page: Page, id: string) {
  await page.goto(`/dev/templates?template=${id}`);
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function boxOf(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} is not drawn.`);
  return box;
}

/** The text a template element sets in a prop, or an error when it is not plain words. */
function wordsOf(template: UiTemplate, element: string, prop: string): string {
  const value = template.fragment.elements[element]?.props?.[prop];
  if (typeof value !== "string" || value === "") throw new Error(`${template.id}: ${element}.${prop} is not plain words.`);
  return value;
}

/** Every template that draws a browser frame, with the address it writes in the window's bar. */
const browserFrames = uiTemplates.flatMap((template) =>
  Object.entries(template.fragment.elements)
    .filter(([, element]) => element.type === "Placeholder" && element.props?.frame === "browser")
    .map(([key]) => ({ template, key })),
);

test("should find at least one template with a browser frame, so the address checks below run", () => {
  expect(browserFrames.length).toBeGreaterThan(0);
});

for (const { template, key } of browserFrames) {
  test(`should write ${template.id}'s example address in its browser bar, whole, at every frame width`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the frames are the same widths in every project; once is enough");
    const address = wordsOf(template, key, "address");
    await open(page, template.id);
    for (const width of templateFrameWidths[template.viewport]) {
      const bar = frameAt(page, template.id, width).locator('[data-frame="browser"]').first().getByText(address, { exact: true });
      await bar.scrollIntoViewIfNeeded();
      await expect(bar, `the address at ${String(width)}`).toBeVisible();
      // A truncated address ends in an ellipsis: what is drawn must be everything that was written.
      const whole = await bar.evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth);
      expect(whole, `the address at ${String(width)} fits its bar`).toBe(true);
    }
  });
}

test("should draw the enterprise button as wide as its words' column once the bar has stacked, and not beside them", async ({ page, isMobile }) => {
  test.skip(isMobile, "the frames are the same widths in every project; once is enough");
  const template = findTemplate("pricing-two-tiers-enterprise");
  if (!template) throw new Error("pricing-two-tiers-enterprise is not in the index.");
  const title = wordsOf(template, "enterprise-title", "text");
  const label = wordsOf(template, "enterprise-cta", "label");
  await open(page, template.id);
  const frame = frameAt(page, template.id, 390);
  await frame.scrollIntoViewIfNeeded();
  const heading = frame.getByRole("heading", { name: title, exact: true });
  const button = frame.getByRole("button", { name: label, exact: true });
  // Two stacked readings: a phone, and the tablet frame made narrower than a stacking row's step.
  for (const width of [390, 640]) {
    expect(width).toBeLessThan(stackedBelow);
    await setFrameWidth(frame, width);
    const words = await boxOf(heading, `the enterprise heading at ${String(width)}`);
    const action = await boxOf(button, `the enterprise button at ${String(width)}`);
    expect(action.y, `the button comes after the words at ${String(width)}`).toBeGreaterThan(words.y + words.height);
    expect(Math.abs(action.x - words.x), `the button starts where the words do at ${String(width)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(action.width - words.width), `the button is as wide as the words' column at ${String(width)}`).toBeLessThanOrEqual(1);
  }
  await setFrameWidth(frame, null);
  // Drawn as a row, the button keeps its own width at the end of the bar.
  const wide = frameAt(page, template.id, 1440);
  await wide.scrollIntoViewIfNeeded();
  const rowWords = await boxOf(wide.getByRole("heading", { name: title, exact: true }), "the enterprise heading at 1440");
  const rowButton = await boxOf(wide.getByRole("button", { name: label, exact: true }), "the enterprise button at 1440");
  expect(rowButton.x, "the button sits beside the words at 1440").toBeGreaterThan(rowWords.x + rowWords.width);
  expect(rowButton.width, "the button is not stretched at 1440").toBeLessThan(rowWords.width);
});
