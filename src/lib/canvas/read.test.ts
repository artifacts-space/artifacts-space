import { describe, expect, it } from "vitest";

import { frameSpecText, readCanvas } from "./read";

const spec = { version: 1, root: "page", elements: { page: { type: "Heading", props: { text: "Hello" } } } };

describe("frameSpecText", () => {
  it("should return the spec as JSON text when the frame has one", () => {
    const [frame] = readCanvas({ version: 1, frames: [{ id: "home", name: "Home", width: 390, spec }] }).frames;
    expect(frame && frameSpecText(frame)).toBe(JSON.stringify(spec));
  });

  it("should return null when the frame has no usable spec", () => {
    const frames = readCanvas({ version: 1, frames: [{ id: "none", name: "None", width: 390 }, { id: "text", name: "Text", width: 390, spec: "{}" }, "not a frame"] }).frames;
    expect(frames.map((frame) => frameSpecText(frame))).toEqual([null, null, null]);
  });

  it("should return null, not throw, when the spec nests too deep to write out as JSON", () => {
    const deep: Record<string, unknown> = {};
    let inner = deep;
    for (let level = 0; level < 100_000; level += 1) {
      const next: Record<string, unknown> = {};
      inner.a = next;
      inner = next;
    }
    expect(() => JSON.stringify(deep)).toThrow(RangeError);
    expect(frameSpecText({ spec: deep })).toBeNull();
  });

  it("should return null when the spec holds a cycle", () => {
    const cycle: Record<string, unknown> = { version: 1 };
    cycle.self = cycle;
    expect(frameSpecText({ spec: cycle })).toBeNull();
  });
});

describe("readCanvas", () => {
  it("should read the frames' own fields without validating their specs", () => {
    const read = readCanvas({ version: 1, frames: [{ id: "home", name: "Home", width: 390, spec: { root: "nowhere" } }] });
    expect(read.renderable).toBe(true);
    expect(read.issues).toEqual([]);
    expect(read.frames[0]).toMatchObject({ id: "home", label: 'Frame "home"', width: 390, height: null, padding: "md", position: null, elementCount: 0, issues: [] });
  });
});
