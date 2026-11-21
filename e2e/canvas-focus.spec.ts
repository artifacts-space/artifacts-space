import type { Locator, Page } from "@playwright/test";

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

/**
 * The same board after its last frame's switch took the focus: the board has moved left to show it, and the first
 * frame's button is now past the board's left edge. A box scrolls no further back than its own start, so a focus on
 * that button scrolls nothing, and no scroll event tells the board of it.
 */
async function firstButtonPastLeftEdge(page: Page) {
  const { pane, alerts } = await alertsOutsideBoard(page);
  await alerts.focus();
  await expect.poll(() => pannedIntoView(page, alerts, pane)).toBe(true);
  await boardAtRest(page);
  const first = frame(page, "sign-in").getByRole("button", { name: "Continue with email" });
  const box = await boxOf(first);
  expect(box.x + box.width).toBeLessThan(pane.x);
  return { pane, first };
}

/**
 * The keyboard's focus on the first frame's button, past the board's left edge, taken while a glide of three seconds
 * runs: longer than any wait the board could give up after. This focus scrolls nothing, so nothing ends the glide
 * early, and the glide takes the control further out. A pan measured while the board still moves would be short by
 * what the glide had left. Only a glide is made long (the world has that class only while it glides): a pan must
 * still land at once.
 */
async function focusedDuringLongGlide(page: Page) {
  const { pane, first } = await firstButtonPastLeftEdge(page);
  // The focus is the keyboard's from here on: one real key press, and a focus a script moves on from it stays so.
  await page.keyboard.press("Shift+Tab");
  const before = await boxOf(first);
  expect(before.x + before.width).toBeLessThan(pane.x);
  await page.addStyleTag({ content: "[data-canvas-world].transition-transform { transition-duration: 3000ms !important; }" });
  expect(await focusMidGlide(first, { key: "ArrowRight" })).toBe("gliding");
  await expect(first).toBeFocused();
  return { pane, first };
}

/** Waits, a frame at a time, until the board's glide has run for `ms`, and says whether it still runs then. */
const glideAt = (control: Locator, ms: number): Promise<"gliding" | "at rest"> => control.evaluate(async (element, reach) => {
  const glide = element.closest("[data-canvas-board]")?.querySelector("[data-canvas-world]")?.getAnimations({ subtree: false })[0];
  const reached = async (): Promise<"gliding" | "at rest"> => {
    if (glide?.playState !== "running") return "at rest";
    if (Number(glide.currentTime ?? 0) >= reach) return "gliding";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return reached();
  };
  return reached();
}, ms);

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

  test("should bring a control into view when the keyboard's focus moves to one past the board's left edge, where the box has nothing to scroll", async ({ page }) => {
    const { pane, first } = await firstButtonPastLeftEdge(page);
    // The focus is the keyboard's from here on: one real key press, and a focus a script moves on from it stays so.
    await page.keyboard.press("Shift+Tab");
    const before = await boxOf(first);
    expect(before.x + before.width).toBeLessThan(pane.x);
    await first.focus();
    await expect(first).toBeFocused();
    await expect.poll(() => pannedIntoView(page, first, pane)).toBe(true);
    await boardAtRest(page);
    expect(await pannedIntoView(page, first, pane)).toBe(true);
  });

  test("should bring a control into view only once the board is at rest when a glide runs long after the keyboard's focus moved to it", async ({ page }) => {
    const { pane, first } = await focusedDuringLongGlide(page);
    // Half way through, the board has not jumped: the glide still runs, and the control is still out of view.
    expect(await glideAt(first, 1500)).toBe("gliding");
    expect((await boxOf(first)).x).toBeLessThan(pane.x);
    await expect.poll(() => pannedIntoView(page, first, pane), { timeout: 10_000 }).toBe(true);
    await boardAtRest(page);
    expect(await pannedIntoView(page, first, pane)).toBe(true);
  });

  test("should bring a control into view only once the board is at rest when a second glide cuts the first short", async ({ page }) => {
    const { pane, first } = await focusedDuringLongGlide(page);
    expect(await glideAt(first, 1000)).toBe("gliding");
    // A second arrow turns the board round part way: the first glide is cut short, which ends the board's wait for
    // it, and another glide runs. The board must wait again, not take the first one's end for rest.
    const second = await first.evaluate(async (control) => {
      const pane = control.closest("[data-canvas-board]");
      const moving = pane?.querySelector("[data-canvas-world]");
      if (!pane || !moving) return "missing";
      const [cut] = moving.getAnimations({ subtree: false });
      pane.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true }));
      // Long enough for a board that took the cut for rest to have panned: three frames.
      for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      const [next] = moving.getAnimations({ subtree: false });
      if (next?.playState !== "running") return "at rest";
      return next === cut ? "same glide" : "gliding anew";
    });
    expect(second).toBe("gliding anew");
    expect((await boxOf(first)).x).toBeLessThan(pane.x);
    await expect.poll(() => pannedIntoView(page, first, pane), { timeout: 10_000 }).toBe(true);
    await boardAtRest(page);
    expect(await pannedIntoView(page, first, pane)).toBe(true);
  });

  test("should not move the board when a pointer press focuses a control that is partly past the board's left edge", async ({ page }) => {
    const { pane, first } = await firstButtonPastLeftEdge(page);
    // Drag the board until the button's left half is cut off by the board's edge.
    const hidden = await boxOf(first);
    const across = pane.x - hidden.x - hidden.width / 2;
    const from = { x: pane.x + 40, y: pane.y + pane.height - 12 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + across / 2, from.y, { steps: 4 });
    await page.mouse.move(from.x + across, from.y, { steps: 4 });
    await page.mouse.up();
    await boardAtRest(page);
    const cut = await boxOf(first);
    expect(cut.x).toBeLessThan(pane.x);
    expect(cut.x + cut.width).toBeGreaterThan(pane.x + 8);
    await page.mouse.click(pane.x + (cut.x + cut.width - pane.x) / 2, cut.y + cut.height / 2);
    await expect(first).toBeFocused();
    await boardAtRest(page);
    expect((await boxOf(first)).x).toBe(cut.x);
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
