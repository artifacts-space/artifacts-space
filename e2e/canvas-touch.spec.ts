import { board, boxInBoard, boxOf, framesInWindow, openCanvas as open, touchScreen, zoomOf } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * The canvas board under fingers, on the fixture page /dev/canvas (no
 * database): a touch screen wide enough for the board, where two fingers
 * zoom and carry the board, one finger sideways pans it, and one finger up
 * or down always scrolls the page.
 */

test.describe("on a touch screen wide enough for the board", () => {
  test.use({ hasTouch: true });
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "a phone stacks the frames; this is a tablet's board");
  });

  test("should zoom the board about the fingers, and not the page, when a reader pinches it", async ({ page }) => {
    await open(page, "flow", "board");
    const touch = await touchScreen(page);
    const pane = await boxOf(board(page));
    const middle = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
    const before = await boxInBoard(page, "inbox");
    const fingers = (apart: number) => [{ x: middle.x - apart, y: middle.y }, { x: middle.x + apart, y: middle.y }];

    await touch("touchStart", fingers(50));
    for (const apart of [60, 70, 80, 90, 100]) await touch("touchMove", fingers(apart));
    await touch("touchEnd", []);

    const after = await boxInBoard(page, "inbox");
    expect(after.width / before.width).toBeCloseTo(2, 1);
    // The board point under the middle of the fingers is still under it.
    const under = (box: { x: number; width: number }) => (pane.width / 2 - box.x) / box.width;
    expect(under(after)).toBeCloseTo(under(before), 2);
    expect(await page.evaluate(() => ({ pageZoom: window.visualViewport?.scale, scrolled: window.scrollY }))).toEqual({ pageZoom: 1, scrolled: 0 });
    await expect(board(page)).not.toHaveAttribute("data-canvas-zoom", "100%");
  });

  test("should keep part of the board in its window when two fingers carry it away or zoom in far from it", async ({ page }) => {
    await open(page, "flow", "board");
    const touch = await touchScreen(page);
    const pane = await boxOf(board(page));
    const y = pane.y + pane.height / 2;
    const pair = (x: number, apart = 40) => [{ x: x - apart, y }, { x: x + apart, y }];

    // Two fingers together, left to right across the window, four times: far more than the board is wide.
    for (let pass = 0; pass < 4; pass += 1) {
      await touch("touchStart", pair(pane.x + 80));
      for (const step of [0.25, 0.5, 0.75, 1]) await touch("touchMove", pair(pane.x + 80 + (pane.width - 160) * step));
      await touch("touchEnd", []);
    }
    const carried = await framesInWindow(page);
    expect(carried.across).toBeGreaterThanOrEqual(70);
    expect(carried.down).toBeGreaterThanOrEqual(70);

    // The board now sits at the right edge. A pinch at the left edge zooms in about a point far from it, which pushes it further right.
    await touch("touchStart", pair(pane.x + 120, 30));
    for (const apart of [60, 90, 120]) await touch("touchMove", pair(pane.x + 120, apart));
    await touch("touchEnd", []);
    const zoomed = await framesInWindow(page);
    expect(zoomed.across).toBeGreaterThanOrEqual(70);
    expect(zoomed.down).toBeGreaterThanOrEqual(70);
    expect(await page.evaluate(() => ({ pageZoom: window.visualViewport?.scale, scrolled: window.scrollY }))).toEqual({ pageZoom: 1, scrolled: 0 });
  });

  test("should scroll the page, and leave the board alone, when a reader swipes up on the board with one finger", async ({ page }) => {
    await open(page, "flow", "board");
    const touch = await touchScreen(page);
    const pane = await boxOf(board(page));
    const before = await boxInBoard(page, "inbox");
    const x = pane.x + pane.width / 2;
    const from = pane.y + pane.height - 60;

    await touch("touchStart", [{ x, y: from }]);
    for (const up of [40, 80, 120, 160, 200, 240]) await touch("touchMove", [{ x, y: from - up }]);
    await touch("touchEnd", []);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect(await boxInBoard(page, "inbox")).toEqual(before);
  });

  test("should move the board, and not the page, when a reader drags sideways with one finger", async ({ page }) => {
    await open(page, "flow", "board");
    const touch = await touchScreen(page);
    const pane = await boxOf(board(page));
    const before = await boxInBoard(page, "inbox");
    const from = { x: pane.x + 40, y: pane.y + 40 };

    await touch("touchStart", [from]);
    for (const right of [30, 60, 90, 120]) await touch("touchMove", [{ x: from.x + right, y: from.y }]);
    await touch("touchEnd", []);

    await expect.poll(async () => Math.round((await boxInBoard(page, "inbox")).x - before.x)).toBe(120);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("should zoom and fit from the board's buttons when a reader taps them", async ({ page }) => {
    await open(page, "flow", "board");
    const toolbar = page.getByRole("group", { name: "Canvas view" });
    const fitted = await zoomOf(page);
    await toolbar.getByRole("button", { name: "Zoom in" }).tap();
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted);
    await toolbar.getByRole("button", { name: "Fit" }).tap();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", `${String(fitted)}%`);
    // Each button is large enough for a finger.
    for (const name of ["Frames", "Zoom out", "Zoom in", "Fit"]) {
      const box = await boxOf(toolbar.getByRole("button", { name, exact: true }));
      expect(Math.min(box.width, box.height), `${name} is at least 28px each way`).toBeGreaterThanOrEqual(28);
    }
  });
});
