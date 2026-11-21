import type { Page } from "@playwright/test";

import { board, boardAtRest, boxOf, focusMidGlide, frame, frameBody, openCanvas as open, pannedIntoView } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * Focus on the canvas board, on the fixture page /dev/canvas (no database):
 * when focus moves to a control outside the board's window, the browser
 * scrolls the board's box and the board turns that scroll into a pan
 * (use-pan-zoom.ts). These tests hold that to its end state: the box back at
 * 0 and the control inside the board, at rest, while a glide runs, when the
 * box cannot scroll as far as the control, and when the page is too busy to
 * hear of the scroll before the glide is over.
 */

/**
 * The flow board at 100% and at rest, with the "Push alerts" switch of its Settings frame outside the board's window,
 * to its right. Every test that starts here needs that last part: with the switch in view from the start, the end
 * state these tests wait for is already there, and they would pass without the board doing anything.
 */
async function alertsOutsideBoard(page: Page) {
  await open(page, "flow", "board");
  await page.getByRole("button", { name: /Show at 100%/ }).click();
  await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
  await boardAtRest(page);
  const pane = await boxOf(board(page));
  const alerts = frame(page, "settings").getByRole("switch", { name: "Push alerts" });
  expect((await boxOf(alerts)).x).toBeGreaterThan(pane.x + pane.width);
  return { pane, alerts };
}

test.describe("on a desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the board shows on wide columns; phones stack the frames");
  });

  test("should bring a control into view when focus moves to it while the board still glides", async ({ page }) => {
    const { pane, alerts } = await alertsOutsideBoard(page);
    expect(await focusMidGlide(alerts)).toBe("gliding");
    await expect(alerts).toBeFocused();
    // The end state, read together: the focus scroll was turned into a pan (the box is back at 0), and the control is
    // inside the board. Right after the focus the box is still scrolled, which alone would put the control in view.
    const atRestInView = () => pannedIntoView(page, alerts, pane);
    await expect.poll(atRestInView).toBe(true);
    // And it stays so once nothing moves any more: no later pan takes the control out again.
    await boardAtRest(page);
    expect(await atRestInView()).toBe(true);
  });

  test("should bring a control into view when focus moves to it during a glide and the board's box cannot scroll as far as the control", async ({ page }) => {
    const { pane, alerts } = await alertsOutsideBoard(page);
    // A scroll of the board's box stops where its scrollable content ends. On a page that has just loaded on a fresh
    // dev server that was 80 pixels, far short of the control (CI, 20 Nov 2026). Made certain here, for both ways the
    // box can be scrolled: the focus scrolls it 80 pixels and no more, and so does any scroll asked of an element.
    // The board asks for none; the second half is here so that a reveal that went back to `scrollIntoView` fails.
    await page.evaluate(() => {
      HTMLElement.prototype.scrollIntoView = function scrollShort(this: HTMLElement) {
        const box = this.closest("[data-canvas-board]");
        if (box) box.scrollLeft += 80;
      };
    });
    expect(await focusMidGlide(alerts, { scrollsOnly: 80 })).toBe("gliding");
    await expect(alerts).toBeFocused();
    await expect.poll(() => pannedIntoView(page, alerts, pane)).toBe(true);
    await boardAtRest(page);
    expect(await pannedIntoView(page, alerts, pane)).toBe(true);
  });

  test("should bring a control into view when focus moves to it at rest and the board's box cannot scroll as far as the control", async ({ page }) => {
    const { pane, alerts } = await alertsOutsideBoard(page);
    // The same short scroll with nothing gliding, made certain: the focus scrolls the box 80 pixels and no more.
    await alerts.evaluate((control: HTMLElement | SVGElement) => {
      control.focus({ preventScroll: true });
      const box = control.closest("[data-canvas-board]");
      if (box) box.scrollLeft = 80;
    });
    await expect(alerts).toBeFocused();
    await expect.poll(() => pannedIntoView(page, alerts, pane)).toBe(true);
    await boardAtRest(page);
    expect(await pannedIntoView(page, alerts, pane)).toBe(true);
  });

  test("should bring a control into view when focus moves to it during a glide and the page is busy until the glide has ended", async ({ page }) => {
    const { pane, alerts } = await alertsOutsideBoard(page);
    // What a slow runner does, made certain: the control is focused a few frames into a glide, so the browser scrolls
    // by where the control is drawn then, and the page stays busy until the glide is over. The scroll reaches the
    // board only afterwards, when nothing glides any more, and must still not leave the control off by the glide.
    expect(await focusMidGlide(alerts, { glidedMs: 60, busyMs: 600 })).toBe("gliding");
    await expect(alerts).toBeFocused();
    const atRestInView = () => pannedIntoView(page, alerts, pane);
    await expect.poll(atRestInView).toBe(true);
    await boardAtRest(page);
    expect(await atRestInView()).toBe(true);
    // Brought in by the least pan: it rests at the board's edge. A second scroll measured before the first pan was
    // drawn would carry it further in (25 px here).
    const end = await boxOf(alerts);
    expect(pane.x + pane.width - (end.x + end.width)).toBeLessThanOrEqual(2);
  });

  test("should bring a control into view, without scrolling the board's box, when focus moves to one outside it", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: /Show at 100%/ }).click();
    await page.getByRole("button", { name: "Frames" }).click();
    await page.getByRole("menuitem", { name: /1\. Sign in/ }).click();
    const pane = await boxOf(board(page));
    const alerts = frame(page, "settings").getByRole("switch", { name: "Push alerts" });
    // Wait for the glide to the first frame to end: it rests one frame-name row and the board's padding below the top edge.
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "sign-in"))).y - pane.y)).toBe(69);
    expect((await boxOf(alerts)).x).toBeGreaterThan(pane.x + pane.width);
    await alerts.focus();
    // Focus first scrolls the board's box, which brings the control into view at once; the box's scroll
    // handler then hands that scroll to the pan and sets the box back to 0, one event later. So wait for
    // the end state, read together: the box at rest and the control still in view.
    await expect.poll(() => pannedIntoView(page, alerts, pane)).toBe(true);
  });
});
