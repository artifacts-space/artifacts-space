import { describe, expect, it } from "vitest";

import { placeFrames } from "./layout";
import { canvasLimits } from "./limits";

const gap = canvasLimits.autoGap;

describe("placeFrames", () => {
  it("should return nothing when there are no frames", () => {
    expect(placeFrames([])).toEqual([]);
  });

  it("should lay frames out in one row from the origin when none has a position", () => {
    const places = placeFrames([{ width: 1440, position: null }, { width: 768, position: null }, { width: 390, position: null }]);
    expect(places).toEqual([{ x: 0, y: 0 }, { x: 1440 + gap, y: 0 }, { x: 1440 + gap + 768 + gap, y: 0 }]);
  });

  it("should keep a frame where its author put it when it has a position", () => {
    expect(placeFrames([{ width: 390, position: { x: -500, y: 240 } }])).toEqual([{ x: -500, y: 240 }]);
  });

  it("should start the automatic row right of the placed frames and level with the highest one when some have positions", () => {
    const places = placeFrames([
      { width: 390, position: null },
      { width: 1000, position: { x: 100, y: 300 } },
      { width: 500, position: { x: 2000, y: -50 } },
      { width: 768, position: null },
    ]);
    expect(places).toEqual([{ x: 2500 + gap, y: -50 }, { x: 100, y: 300 }, { x: 2000, y: -50 }, { x: 2500 + gap + 390 + gap, y: -50 }]);
  });
});
