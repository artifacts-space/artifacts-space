import { describe, expect, it } from "vitest";

import { UI_SPEC_VERSION } from "@/lib/ui/version";

import { appFlowCanvas, brokenFrameCanvas, emptyCanvas, exampleCanvas, largeCanvas, placedCanvas, siteMockupCanvas } from "./fixtures";
import { canvasLimits } from "./limits";
import { validateCanvas } from "./validate";

const heading = (text: string) => ({ version: UI_SPEC_VERSION, root: "page", elements: { page: { type: "Heading", props: { text } } } });
const frame = (overrides: Record<string, unknown> = {}) => ({ id: "home", name: "Home", width: 390, spec: heading("Hello"), ...overrides });
const canvas = (frames: unknown, extra: Record<string, unknown> = {}) => ({ version: 1, frames, ...extra });
const messages = (input: unknown) => validateCanvas(input).issues.map((issue) => issue.message);

describe("validateCanvas", () => {
  it.each([
    ["the site mockup", siteMockupCanvas],
    ["the app flow", appFlowCanvas],
    ["the placed canvas", placedCanvas],
    ["the guide example", exampleCanvas],
    ["an empty canvas", emptyCanvas],
    ["a full board", largeCanvas(canvasLimits.maxFrames)],
  ])("should accept %s with no issues when it is a fixture", (_name, fixture) => {
    const result = validateCanvas(JSON.stringify(fixture));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.renderable).toBe(true);
  });

  it("should accept an already-parsed value when it is not text", () => {
    expect(validateCanvas(canvas([frame()])).valid).toBe(true);
  });

  it("should say what a canvas looks like when the content is not JSON", () => {
    const result = validateCanvas('{ "version": 1, "frames": [');
    expect(result.renderable).toBe(false);
    expect(result.issues[0]?.code).toBe("invalid_json");
    expect(result.issues[0]?.message).toContain('"frames": [{ "id": "home"');
  });

  it.each([["a list", "[]"], ["a string", '"canvas"'], ["null", "null"]])("should refuse %s when the content is not an object", (_name, content) => {
    expect(validateCanvas(content).issues[0]?.code).toBe("not_object");
  });

  it("should refuse the canvas when frames is not a list", () => {
    const result = validateCanvas(canvas({ home: frame() }));
    expect(result.renderable).toBe(false);
    expect(result.issues[0]?.code).toBe("invalid_frames");
  });

  it("should warn and still accept when the version is missing", () => {
    const result = validateCanvas({ frames: [frame()] });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning", code: "missing_version" })]);
  });

  it("should warn and still accept when the canvas has a top-level field it does not take", () => {
    const result = validateCanvas(canvas([frame()], { title: "Checkout flow", width: 390 }));
    expect(result.valid).toBe(true);
    expect(result.renderable).toBe(true);
    expect(result.issues).toEqual([{ severity: "warning", code: "unknown_field", message: '"title", "width" are not canvas fields and are ignored. A canvas takes version and frames; a name, width, or spec belongs on a frame.' }]);
    expect(messages(canvas([frame()], { title: "Checkout flow" }))).toEqual(['"title" is not a canvas field and is ignored. A canvas takes version and frames; a name, width, or spec belongs on a frame.']);
  });

  it.each([[2], [0], [1.5], ["1"]])("should refuse version %j when it is not a version this build knows", (version) => {
    const result = validateCanvas({ version, frames: [frame()] });
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(false);
    expect(result.issues[0]?.code).toBe("unsupported_version");
  });
});

describe("validateCanvas limits", () => {
  it("should refuse the canvas when it has more frames than the limit", () => {
    const frames = Array.from({ length: canvasLimits.maxFrames + 1 }, (_, index) => frame({ id: `f-${String(index)}` }));
    const result = validateCanvas(canvas(frames));
    expect(result.renderable).toBe(false);
    expect(result.issues[0]?.message).toBe(`The canvas has 25 frames; the limit is ${String(canvasLimits.maxFrames)}. Split it into several canvases.`);
  });

  it("should refuse the canvas when its frames hold more elements than the limit together", () => {
    const elements = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`t${String(index)}`, { type: "Text", props: { text: "x" } }]));
    const big = { version: UI_SPEC_VERSION, root: "page", elements: { page: { type: "Stack", props: {}, children: Object.keys(elements) }, ...elements } };
    const frames = Array.from({ length: 8 }, (_, index) => frame({ id: `f-${String(index)}`, spec: big }));
    const result = validateCanvas(canvas(frames));
    expect(result.renderable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["too_many_elements"]);
    expect(result.issues[0]?.message).toContain("3,208 elements across its frames; the limit is 3,000");
  });

  it("should refuse the canvas before parsing when it is larger than the byte limit", () => {
    const result = validateCanvas(JSON.stringify(canvas([frame({ name: "x".repeat(canvasLimits.maxCanvasBytes) })])));
    expect(result.renderable).toBe(false);
    expect(result.issues[0]?.code).toBe("too_large");
  });

  it("should keep the ui limits inside each frame when one frame has too many elements", () => {
    const elements = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`t${String(index)}`, { type: "Text", props: { text: "x" } }]));
    const result = validateCanvas(canvas([frame({ spec: { version: UI_SPEC_VERSION, root: "t0", elements } })]));
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(true);
    expect(result.issues[0]).toMatchObject({ code: "too_many_elements", frameId: "home" });
    expect(result.issues[0]?.message).toMatch(/^Frame "home": The spec has 501 elements; the limit is 500\./);
  });
});

describe("validateCanvas frames", () => {
  it("should name the frame and the element when a prop inside a frame is wrong", () => {
    const spec = { version: UI_SPEC_VERSION, root: "page", elements: { page: { type: "Heading", props: { text: "Hi", level: 9 } } } };
    const result = validateCanvas(canvas([frame(), frame({ id: "pricing", spec })]));
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ frameId: "pricing", elementKey: "page", code: "invalid_props" });
    expect(result.issues[0]?.message).toMatch(/^Frame "pricing": Element "page" \(Heading\): props\.level: /);
  });

  it("should refuse a second frame with the same id and keep both readable", () => {
    const result = validateCanvas(canvas([frame(), frame()]));
    expect(result.valid).toBe(false);
    expect(result.frames.map((item) => item.id)).toEqual(["home", "frame-2"]);
    expect(result.issues[0]?.message).toBe('Frame 2: another frame already has the id "home". Frame ids must be unique.');
  });

  it.each([
    ["an uppercase id", { id: "Home" }, '"id" must be up to 40 lowercase letters'],
    ["a missing id", { id: undefined }, '"id" is missing'],
    ["an id that is not text", { id: 42 }, '"id" must be a string'],
    ["an empty id", { id: "" }, '"id" is empty'],
    ["a missing name", { name: "  " }, '"name" is missing'],
    ["a long name", { name: "n".repeat(81) }, '"name" is 81 characters; the limit is 80.'],
    ["a narrow width", { width: 100 }, '"width" must be a whole number from 240 to 2560'],
    ["a fractional width", { width: 390.5 }, "Usual sizes: 1440 (desktop), 768 (tablet), 390 (phone)."],
    ["a text width", { width: "390" }, '"width" must be a whole number'],
    ["a short height", { height: 10 }, '"height" must be a whole number from 120 to 10000'],
    ["an unknown padding", { padding: "xl" }, '"padding" must be one of "none", "sm", "md", "lg".'],
    ["x without y", { x: 100 }, '"x" and "y" must both be whole numbers'],
    ["a position off the board", { x: 0, y: 200_000 }, "from -100000 to 100000"],
    ["a missing spec", { spec: undefined }, '"spec" must be a ui spec object'],
    ["a spec that is text", { spec: "{}" }, '"spec" must be a ui spec object'],
  ])("should refuse %s and say how to fix it", (_name, overrides, expected) => {
    const result = validateCanvas(canvas([frame(overrides)]));
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(true);
    expect(messages(canvas([frame(overrides)])).join("\n")).toContain(expected);
  });

  it("should accept a height, padding, and position when they are within range", () => {
    const result = validateCanvas(canvas([frame({ height: 844, padding: "none", x: -200, y: 1200 })]));
    expect(result.issues).toEqual([]);
    expect(result.frames[0]).toMatchObject({ height: 844, padding: "none", position: { x: -200, y: 1200 } });
  });

  it("should read null like a missing field when height, padding, x, and y are null", () => {
    const result = validateCanvas(canvas([frame({ height: null, padding: null, x: null, y: null })]));
    expect(result.issues).toEqual([]);
    expect(result.frames[0]).toMatchObject({ height: null, padding: "md", position: null });
  });

  it("should warn and still accept when a frame has a field it does not take", () => {
    const result = validateCanvas(canvas([frame({ title: "Home", zoom: 2 })]));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning", code: "unknown_frame_field", frameId: "home" })]);
    expect(result.issues[0]?.message).toContain('"title", "zoom" are not frame fields and are ignored.');
  });

  it("should refuse a frame that is not an object and still read the others", () => {
    const result = validateCanvas(canvas(["home", frame()]));
    expect(result.valid).toBe(false);
    expect(result.frames.map((item) => item.id)).toEqual(["frame-1", "home"]);
    expect(result.issues[0]?.message).toMatch(/^Frame 1: a frame must be an object/);
  });

  it("should refuse a spec nested far deeper than the limit, without throwing, whether or not the runtime can write it out", () => {
    const depth = 20_000;
    const deep = `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
    const text = `{"version":1,"frames":[{"id":"home","name":"Home","width":390,"spec":${deep}}]}`;
    const result = validateCanvas(text);
    expect(result.valid).toBe(false);
    // Two steps depend on the runtime. Reading the text: a parser with a depth limit refuses the whole canvas as unreadable JSON.
    // Writing the frame's spec out again: a runtime that cannot reports unreadable JSON on the frame; one that can reports the nesting limit on the frame.
    const refusals = result.issues.map((issue) => `${issue.code} on ${issue.frameId ?? "the canvas"}`);
    expect(refusals).toHaveLength(1);
    expect(["invalid_json on the canvas", "invalid_json on home", "too_deep_json on home"]).toContain(refusals[0]);
  });

  it("should refuse a spec nested deeper than the limit by naming that limit when every runtime can write the nesting out", () => {
    const depth = 1_000;
    const deep = JSON.parse(`${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`) as unknown;
    const result = validateCanvas({ version: 1, frames: [{ id: "home", name: "Home", width: 390, spec: deep }] });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ code: "too_deep_json", frameId: "home" })]);
    expect(result.issues[0]?.message).toMatch(/^Frame "home": The spec nests JSON more than 64 levels deep\./);
  });

  it("should report each bad frame of the broken fixture and keep the good one clean", () => {
    const result = validateCanvas(brokenFrameCanvas);
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(true);
    expect(result.issues.filter((issue) => issue.frameId === "good")).toEqual([]);
    expect(result.issues.filter((issue) => issue.frameId === "frame-2").length).toBeGreaterThanOrEqual(3);
    expect(result.issues.find((issue) => issue.frameId === "no-root")?.message).toBe('Frame "no-root": "root" is "nowhere", but no element has that key.');
  });
});
