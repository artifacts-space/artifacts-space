import { describe, expect, it } from "vitest";

import { canvasLimits, frameSizes } from "./limits";
import { boundsOf, clampZoom, fitPadding, fitView, frameView, nextZoomStep, panBy, stackedScale, wheelZoom, zoomAbout, zoomPercent, zoomRange } from "./view-rules";

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

describe("stackedScale", () => {
  it("should shrink a frame wider than the column to the column's width", () => {
    expect(stackedScale(1440, 358)).toBeCloseTo(358 / 1440);
  });

  it("should leave a frame narrower than the column at 100%", () => {
    expect(stackedScale(390, 600)).toBe(1);
  });

  it("should stay at 100% when the column has not been measured", () => {
    expect(stackedScale(390, 0)).toBe(1);
  });
});
