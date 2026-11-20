import { board, boxOf, frame, frameBody, openCanvas as open } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * Focus on the canvas board, on the fixture page /dev/canvas (no database):
 * when focus moves to a control outside the board's window, the browser
 * scrolls the board's box and the board turns that scroll into a pan
 * (use-pan-zoom.ts). These tests hold that to its end state: the box back at
 * 0 and the control inside the board, at rest, while a glide runs, and when
 * the page is too busy to hear of the scroll before the glide is over.
 */

test.describe("on a desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the board shows on wide columns; phones stack the frames");
  });

  test("should bring a control into view when focus moves to it while the board still glides", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: /Show at 100%/ }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
    const world = board(page).locator("[data-canvas-world]");
    const atRest = () => world.evaluate(async (element) => {
      await Promise.allSettled(element.getAnimations({ subtree: false }).map((animation) => animation.finished));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await atRest();
    const pane = await boxOf(board(page));
    const alerts = frame(page, "settings").getByRole("switch", { name: "Push alerts" });
    expect((await boxOf(alerts)).x).toBeGreaterThan(pane.x + pane.width);
    // In the page and in one task (no frame in between), so it holds on a runner of any speed: an arrow key starts a
    // glide that takes the control further out, and the control is focused before the glide has moved at all. The
    // browser then scrolls by where the control is drawn at that moment, not by where the view comes to rest, and
    // the scroll reaches the board a frame later, while the glide runs.
    const glide = await alerts.evaluate(async (control: HTMLElement) => {
      const pane = control.closest("[data-canvas-board]");
      const moving = pane?.querySelector("[data-canvas-world]");
      if (!pane || !moving) return "missing";
      pane.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true }));
      // React draws the key press in a microtask of this same task.
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
      const running = moving.getAnimations({ subtree: false }).length > 0;
      control.focus();
      return running ? "gliding" : "at rest";
    });
    expect(glide).toBe("gliding");
    await expect(alerts).toBeFocused();
    // The end state, read together: the focus scroll was turned into a pan (the box is back at 0), and the control is
    // inside the board. Right after the focus the box is still scrolled, which alone would put the control in view.
    const atRestInView = async () => {
      const [scroll, box] = await Promise.all([board(page).evaluate((element) => [element.scrollLeft, element.scrollTop]), boxOf(alerts)]);
      return scroll[0] === 0 && scroll[1] === 0 && box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
    };
    await expect.poll(atRestInView).toBe(true);
    // And it stays so once nothing moves any more: no later pan takes the control out again.
    await atRest();
    expect(await atRestInView()).toBe(true);
  });

  test("should bring a control into view when focus moves to it during a glide and the page is busy until the glide has ended", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: /Show at 100%/ }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
    const world = board(page).locator("[data-canvas-world]");
    const atRest = () => world.evaluate(async (element) => {
      await Promise.allSettled(element.getAnimations({ subtree: false }).map((animation) => animation.finished));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await atRest();
    const pane = await boxOf(board(page));
    const alerts = frame(page, "settings").getByRole("switch", { name: "Push alerts" });
    expect((await boxOf(alerts)).x).toBeGreaterThan(pane.x + pane.width);
    // What a slow runner does, made certain: the control is focused while a glide runs, so the browser scrolls by
    // where the control is drawn then, and the page stays busy until the glide is over. The scroll reaches the
    // board only afterwards, when nothing glides any more, and must still not leave the control off by the glide.
    const glide = await alerts.evaluate(async (control: HTMLElement) => {
      const pane = control.closest("[data-canvas-board]");
      const moving = pane?.querySelector("[data-canvas-world]");
      if (!pane || !moving) return "missing";
      pane.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
      // Let the glide get under way: a few frames in, the board is drawn between where it was and where it rests.
      const midway = async (): Promise<boolean> => {
        const [animation] = moving.getAnimations({ subtree: false });
        if (!animation) return false;
        if (Number(animation.currentTime ?? 0) >= 60) return true;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return midway();
      };
      const running = await midway();
      control.focus();
      const until = performance.now() + 600;
      while (performance.now() < until) { /* busy: no frame is drawn and no event runs */ }
      return running ? "gliding" : "at rest";
    });
    expect(glide).toBe("gliding");
    await expect(alerts).toBeFocused();
    const atRestInView = async () => {
      const [scroll, box] = await Promise.all([board(page).evaluate((element) => [element.scrollLeft, element.scrollTop]), boxOf(alerts)]);
      return scroll[0] === 0 && scroll[1] === 0 && box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
    };
    await expect.poll(atRestInView).toBe(true);
    await atRest();
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
    // the end state: the box at rest and the control still in view.
    await expect.poll(async () => board(page).evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([0, 0]);
    await expect.poll(async () => {
      const box = await boxOf(alerts);
      return box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
    }).toBe(true);
  });
});
