import { describe, expect, it } from "vitest";

import { canvasLimits, frameSizes } from "./limits";
import { boundsOf, clampZoom, fitPadding, fitView, frameView, keepInWindow, nextZoomStep, panBy, panToReveal, pinchOf, pinchView, wheelZoom, zoomAbout, zoomPercent, zoomRange } from "./view-rules";

const window = { width: 1000, height: 600 };

describe("boundsOf", () => {
  it("should return null when there are no boxes", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("should hold every box when they are apart", () => {
    expect(boundsOf([{ x: -100, y: 50, width: 200, height: 100 }, { x: 400, y: -20, width: 100, height: 300 }])).toEqual({ x: -100, y: -20, width: 600, height: 300 });
  });
});

describe("fitView", () => {
  it("should shrink a board wider than the window so all of it shows inside the padding", () => {
    const view = fitView({ x: 0, y: 0, width: 4600, height: 1000 }, window);
    expect(view.zoom).toBeCloseTo((1000 - fitPadding * 2) / 4600);
    expect(view.x).toBeCloseTo(fitPadding);
    expect(view.y + 1000 * view.zoom).toBeLessThanOrEqual(600 - fitPadding);
  });

  it("should never enlarge a board that is smaller than the window", () => {
    const view = fitView({ x: 0, y: 0, width: 390, height: 300 }, window);
    expect(view.zoom).toBe(1);
    expect(view.x).toBe((1000 - 390) / 2);
  });

  it("should bring a board placed far from the origin into the window", () => {
    const bounds = { x: 5000, y: -3000, width: 500, height: 400 };
    const view = fitView(bounds, window);
    expect(view.x + bounds.x * view.zoom).toBe(250);
    expect(view.y + bounds.y * view.zoom).toBe(100);
  });

  it("should not go below the smallest zoom when the board is enormous", () => {
    expect(fitView({ x: 0, y: 0, width: 200_000, height: 1000 }, window).zoom).toBe(zoomRange.min);
  });

  it("should show a full row of the widest usual frames inside the smallest zoom", () => {
    const row = canvasLimits.maxFrames * frameSizes.desktop + (canvasLimits.maxFrames - 1) * canvasLimits.autoGap;
    expect(fitView({ x: 0, y: 0, width: row, height: 2000 }, window).zoom).toBeGreaterThan(zoomRange.min);
  });

  it("should stay at 100% when there is nothing to fit", () => {
    expect(fitView(null, window).zoom).toBe(1);
  });
});

describe("frameView", () => {
  it("should fit the frame's width and put its top near the window's top", () => {
    const view = frameView({ x: 1520, y: 200, width: 1440, height: 2000 }, window);
    expect(view.zoom).toBeCloseTo(920 / 1440);
    expect(view.x + 1520 * view.zoom).toBeCloseTo(fitPadding);
    expect(view.y + 200 * view.zoom).toBeCloseTo(fitPadding);
  });

  it("should show a frame narrower than the window at 100%, centered", () => {
    const view = frameView({ x: 0, y: 0, width: 390, height: 844 }, window);
    expect(view).toEqual({ zoom: 1, x: 305, y: fitPadding });
  });
});

describe("zooming", () => {
  it("should keep the board point under the pointer where it is when zooming about it", () => {
    const before = { zoom: 0.5, x: 120, y: -40 };
    const point = { x: 300, y: 200 };
    const after = zoomAbout(before, point, 1);
    expect((point.x - before.x) / before.zoom).toBeCloseTo((point.x - after.x) / after.zoom);
    expect((point.y - before.y) / before.zoom).toBeCloseTo((point.y - after.y) / after.zoom);
  });

  it("should clamp the zoom to its range", () => {
    expect(clampZoom(9)).toBe(zoomRange.max);
    expect(clampZoom(0)).toBe(zoomRange.min);
    expect(zoomAbout({ zoom: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 50).zoom).toBe(zoomRange.max);
  });

  it("should step to the next stop in each direction and stop at the ends", () => {
    expect(nextZoomStep(0.4, 1)).toBe(0.5);
    expect(nextZoomStep(0.5, 1)).toBe(0.67);
    expect(nextZoomStep(0.5, -1)).toBe(0.33);
    expect(nextZoomStep(0.496, 1)).toBe(0.67);
    expect(nextZoomStep(0.504, -1)).toBe(0.33);
    expect(nextZoomStep(2, 1)).toBe(2);
    expect(nextZoomStep(0.05, -1)).toBe(0.02);
    expect(nextZoomStep(0.02, -1)).toBe(0.02);
  });

  it("should zoom in when the wheel turns up and out by the same ratio when it turns down", () => {
    const up = wheelZoom(1, -100);
    expect(up).toBeGreaterThan(1);
    expect(wheelZoom(up, 100)).toBeCloseTo(1);
  });

  it("should label the zoom as a whole percent", () => {
    expect(zoomPercent(0.333)).toBe("33%");
    expect(zoomPercent(1)).toBe("100%");
  });
});

describe("panBy", () => {
  const bounds = { x: 0, y: 0, width: 800, height: 400 };

  it("should move the view by the drag when the board stays in the window", () => {
    expect(panBy({ zoom: 1, x: 10, y: 20 }, { x: 30, y: -5 }, bounds, window)).toEqual({ zoom: 1, x: 40, y: 15 });
  });

  it("should keep part of the board in the window when a drag would push it out", () => {
    expect(panBy({ zoom: 1, x: 0, y: 0 }, { x: 5000, y: 5000 }, bounds, window)).toEqual({ zoom: 1, x: 920, y: 520 });
    expect(panBy({ zoom: 1, x: 0, y: 0 }, { x: -5000, y: -5000 }, bounds, window)).toEqual({ zoom: 1, x: -720, y: -320 });
  });
});

describe("panToReveal", () => {
  const pane = { left: 232, top: 62, right: 1208, bottom: 710 };

  it("should not move the view when the control is inside the window", () => {
    expect(panToReveal({ left: 400, top: 100, right: 444, bottom: 124 }, pane)).toEqual({ x: 0, y: 0 });
  });

  it("should move the view left by what the control lacks when it is past the right edge", () => {
    expect(panToReveal({ left: 1713, top: 100, right: 1757, bottom: 124 }, pane)).toEqual({ x: -549, y: 0 });
  });

  it("should move the view right and down when the control is past the left and top edges", () => {
    expect(panToReveal({ left: 100, top: 10, right: 144, bottom: 34 }, pane)).toEqual({ x: 132, y: 52 });
  });

  it("should bring the control's start into the window when it is wider than the window", () => {
    expect(panToReveal({ left: 1300, top: 100, right: 2400, bottom: 124 }, pane)).toEqual({ x: -1068, y: 0 });
  });
});

describe("keepInWindow", () => {
  const bounds = { x: 0, y: 0, width: 800, height: 400 };

  it("should leave a view alone when part of the board is already in the window", () => {
    const view = { zoom: 0.5, x: -200, y: 300 };
    expect(keepInWindow(view, bounds, window)).toEqual(view);
    expect(keepInWindow(view, null, window)).toBe(view);
  });

  it("should bring the board back to the window's edge when a pinch carried it out", () => {
    // Two fingers that start at the board's corner and move together far past the window's right and bottom edges.
    const carried = pinchView({ zoom: 1, x: 0, y: 0 }, { center: { x: 10, y: 10 }, distance: 100 }, { center: { x: 5000, y: 5000 }, distance: 100 });
    expect(carried).toEqual({ zoom: 1, x: 4990, y: 4990 });
    expect(keepInWindow(carried, bounds, window)).toEqual(panBy({ zoom: 1, x: 0, y: 0 }, { x: 5000, y: 5000 }, bounds, window));
  });

  it("should bring the board back when a zoom about a far point pushed it out", () => {
    // The board fills the window's left; zooming in about a point at the right edge sends it off to the left.
    const pushed = zoomAbout({ zoom: 0.25, x: 40, y: 40 }, { x: window.width - 10, y: 300 }, 2);
    expect(pushed.x + bounds.width * pushed.zoom).toBeLessThan(0);
    const kept = keepInWindow(pushed, bounds, window);
    expect(kept.zoom).toBe(2);
    expect(kept.x + bounds.width * kept.zoom).toBe(80);
  });
});

describe("pinchOf", () => {
  it("should give the point midway between two touches and the distance between them", () => {
    expect(pinchOf({ x: 100, y: 100 }, { x: 400, y: 500 })).toEqual({ center: { x: 250, y: 300 }, distance: 500 });
  });
});

describe("pinchView", () => {
  const view = { zoom: 0.5, x: 40, y: 60 };
  const from = { center: { x: 300, y: 200 }, distance: 100 };

  it("should zoom about the middle of the fingers when they move apart", () => {
    const next = pinchView(view, from, { center: from.center, distance: 200 });
    expect(next.zoom).toBe(1);
    // The board point under the fingers, (300 - 40) / 0.5 = 520 and (200 - 60) / 0.5 = 280, is still under them.
    expect(next.x + 520 * next.zoom).toBeCloseTo(300);
    expect(next.y + 280 * next.zoom).toBeCloseTo(200);
  });

  it("should zoom out when the fingers move together", () => {
    expect(pinchView(view, from, { center: from.center, distance: 50 }).zoom).toBe(0.25);
  });

  it("should move the board with the fingers when they keep their distance", () => {
    expect(pinchView(view, from, { center: { x: 350, y: 180 }, distance: 100 })).toEqual({ zoom: 0.5, x: 90, y: 40 });
  });

  it("should stop at the zoom limits and still keep the point under the fingers", () => {
    const most = pinchView(view, from, { center: from.center, distance: 10_000 });
    expect(most.zoom).toBe(zoomRange.max);
    expect(most.x + 520 * most.zoom).toBeCloseTo(300);
    expect(pinchView(view, from, { center: from.center, distance: 0.001 }).zoom).toBe(zoomRange.min);
  });

  it("should keep the zoom when the pinch began with both fingers on one point", () => {
    expect(pinchView(view, { center: from.center, distance: 0 }, { center: from.center, distance: 80 })).toEqual(view);
  });
});
