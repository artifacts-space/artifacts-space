import { describe, expect, it } from "vitest";

import { frameChanges } from "./frame-changes";

const spec = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Text", props: { text } } } });
const canvas = (frames: Record<string, unknown>[]) => JSON.stringify({ version: 1, frames });
const home = { id: "home", name: "Home", width: 1440, spec: spec("Welcome") };
const pricing = { id: "pricing", name: "Pricing", width: 1440, spec: spec("Plans") };

describe("frameChanges", () => {
  it("should report nothing when the two saves hold the same frames", () => {
    expect(frameChanges(canvas([home, pricing]), canvas([home, pricing]))).toEqual({ changed: [], removed: 0 });
  });

  it("should report a frame when what it draws changed", () => {
    const after = canvas([home, { ...pricing, spec: spec("New plans") }]);
    expect(frameChanges(canvas([home, pricing]), after)).toEqual({ changed: [{ id: "pricing", name: "Pricing" }], removed: 0 });
  });

  it("should report a frame under its new name when it was renamed, resized, or moved on the board", () => {
    expect(frameChanges(canvas([home]), canvas([{ ...home, name: "Start" }])).changed).toEqual([{ id: "home", name: "Start" }]);
    expect(frameChanges(canvas([home]), canvas([{ ...home, width: 390 }])).changed).toEqual([{ id: "home", name: "Home" }]);
    expect(frameChanges(canvas([home]), canvas([{ ...home, x: 200, y: 0 }])).changed).toEqual([{ id: "home", name: "Home" }]);
  });

  it("should report a new frame as changed and count a frame that is gone", () => {
    const after = canvas([home, { id: "about", name: "About", width: 1440, spec: spec("Us") }]);
    expect(frameChanges(canvas([home, pricing]), after)).toEqual({ changed: [{ id: "about", name: "About" }], removed: 1 });
  });

  it("should report no change when the frames only changed their order", () => {
    expect(frameChanges(canvas([home, pricing]), canvas([pricing, home]))).toEqual({ changed: [], removed: 0 });
  });

  it("should report every frame when the canvas could not be read before", () => {
    expect(frameChanges("not json", canvas([home])).changed).toEqual([{ id: "home", name: "Home" }]);
  });
});
