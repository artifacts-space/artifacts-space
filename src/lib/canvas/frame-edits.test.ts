import { describe, expect, it } from "vitest";

import { boardOutline, CanvasEditError, deleteFrame, frameDetail, saveFrame, updateFrame } from "./frame-edits";
import { canvasLimits } from "./limits";
import { validateCanvas } from "./validate";

const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Heading", props: { text } } } });
const frame = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: `Screen ${id}`, width: 390, spec: heading(id), ...overrides });
const board = (frames: readonly unknown[], indent?: number) => JSON.stringify({ version: 1, frames }, null, indent);
const three = board([frame("home"), frame("pricing"), frame("sign-in")]);
const idsOf = (content: string) => (JSON.parse(content) as { frames: { id: string }[] }).frames.map((item) => item.id);
/** The message of the error a change throws, or "" when it does not throw. */
const refusalOf = (run: () => unknown): string => {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof CanvasEditError ? error.message : `not a CanvasEditError: ${String(error)}`;
  }
};

describe("boardOutline", () => {
  it("should list each frame's own fields without its spec when the canvas is valid", () => {
    const outline = boardOutline(board([frame("home", { width: 1440, height: 900, padding: "none" }), frame("phone", { x: 10, y: 2000 })]));
    expect(outline.readable).toBe(true);
    expect(outline.frames).toEqual([
      // A frame with no x and y of its own is placed by the board: here to the right of the frame that has them, level with it.
      { id: "home", name: "Screen home", width: 1440, height: 900, padding: "none", position: { x: 480, y: 2000, auto: true }, elements: 1, problems: 0 },
      { id: "phone", name: "Screen phone", width: 390, height: null, padding: "md", position: { x: 10, y: 2000, auto: false }, elements: 1, problems: 0 },
    ]);
    expect(JSON.stringify(outline)).not.toContain("Heading");
    expect(outline.elements).toBe(2);
    expect(outline.problems).toEqual([]);
  });

  it("should give the canvas's size in bytes, not characters", () => {
    const content = board([frame("home", { name: "Café" })]);
    expect(boardOutline(content).bytes).toBe(new TextEncoder().encode(content).length);
    expect(boardOutline(content).bytes).toBeGreaterThan(content.length);
  });

  it("should count a frame's problems and keep the others clean when one frame is wrong", () => {
    const result = boardOutline(board([frame("home"), frame("bad", { width: 10, spec: { version: 1, root: "nowhere", elements: {} } })]));
    expect(result.frames.map((item) => item.problems)).toEqual([0, 2]);
  });

  it("should say why and list no frames when the canvas cannot be read", () => {
    const result = boardOutline('{ "version": 1, "frames": "none" }');
    expect(result).toMatchObject({ readable: false, frames: [], elements: 0 });
    expect(result.problems[0]).toContain('"frames" must be a list of frames');
  });
});

describe("frameDetail", () => {
  it("should return the frame exactly as written, with its outline", () => {
    const written = frame("pricing", { note: "kept as written" });
    const detail = frameDetail(board([frame("home"), written]), "pricing");
    expect(detail.frame).toEqual(written);
    expect(detail.outline).toMatchObject({ id: "pricing", position: { x: 470, y: 0, auto: true }, problems: 0 });
    expect(detail.problems).toEqual([]);
  });

  it("should list each problem of the frame, naming the frame and the element", () => {
    const bad = frame("bad", { spec: { version: 1, root: "page", elements: { page: { type: "Heading", props: { text: "Hi", level: 9 } } } } });
    const detail = frameDetail(board([frame("home"), bad]), "bad");
    expect(detail.problems).toHaveLength(1);
    expect(detail.problems[0]).toMatch(/^Frame "bad": .*page/);
  });

  it("should name the frames the canvas has when no frame has that id", () => {
    expect(refusalOf(() => frameDetail(three, "checkout"))).toBe('No frame has the id "checkout". The frames are: "home", "pricing", "sign-in".');
    expect(refusalOf(() => frameDetail(board([]), "home"))).toBe('No frame has the id "home". This canvas has no frames yet.');
  });

  it("should say the canvas cannot be read, and how to fix it, when it is not a canvas", () => {
    expect(refusalOf(() => frameDetail("not json", "home"))).toMatch(/^This canvas cannot be read, so its frames cannot be read or changed one at a time: .* Fix the whole canvas with artifacts_update\.$/);
  });
});

describe("saveFrame", () => {
  it("should add a new frame at the end when no place is given", () => {
    const edit = saveFrame(three, frame("checkout"));
    expect(idsOf(edit.content)).toEqual(["home", "pricing", "sign-in", "checkout"]);
    expect(edit).toMatchObject({ frameId: "checkout", added: true, changed: true });
    expect(validateCanvas(edit.content).valid).toBe(true);
  });

  it("should add a new frame after the frame named, or at the index given", () => {
    expect(idsOf(saveFrame(three, frame("checkout"), { after: "home" }).content)).toEqual(["home", "checkout", "pricing", "sign-in"]);
    expect(idsOf(saveFrame(three, frame("checkout"), { index: 0 }).content)).toEqual(["checkout", "home", "pricing", "sign-in"]);
    expect(idsOf(saveFrame(three, frame("checkout"), { index: 99 }).content)).toEqual(["home", "pricing", "sign-in", "checkout"]);
  });

  it("should replace the frame with the same id in its place, and leave the other frames as written", () => {
    const edit = saveFrame(three, frame("pricing", { name: "Pricing, new", width: 1440 }));
    const frames = (JSON.parse(edit.content) as { frames: Record<string, unknown>[] }).frames;
    expect(frames.map((item) => item.id)).toEqual(["home", "pricing", "sign-in"]);
    expect(frames[1]).toEqual(frame("pricing", { name: "Pricing, new", width: 1440 }));
    expect([frames[0], frames[2]]).toEqual([frame("home"), frame("sign-in")]);
    expect(edit).toMatchObject({ added: false, changed: true });
  });

  it("should move a replaced frame when a place is given", () => {
    expect(idsOf(saveFrame(three, frame("home"), { after: "sign-in" }).content)).toEqual(["pricing", "sign-in", "home"]);
    expect(idsOf(saveFrame(three, frame("sign-in"), { index: 0 }).content)).toEqual(["sign-in", "home", "pricing"]);
  });

  it("should report nothing to save when the frame is the one the canvas already has", () => {
    expect(saveFrame(three, frame("pricing"))).toMatchObject({ added: false, changed: false });
  });

  it("should keep the canvas's other fields and its indentation", () => {
    const pretty = JSON.stringify({ version: 1, frames: [frame("home")] }, null, 2);
    expect(saveFrame(pretty, frame("pricing")).content).toBe(JSON.stringify({ version: 1, frames: [frame("home"), frame("pricing")] }, null, 2));
    expect(saveFrame(three, frame("checkout")).content).not.toContain("\n");
  });

  it("should refuse a frame that is not valid and name the frame, the element, and the fix", () => {
    const bad = frame("checkout", { width: 10, spec: { version: 1, root: "page", elements: { page: { type: "Heading", props: { text: "Hi", level: 9 } } } } });
    const message = refusalOf(() => saveFrame(three, bad));
    expect(message).toMatch(/^The frame is not valid\. Nothing was saved\. Fix these and try again:\n/);
    expect(message).toContain('- Error: Frame "checkout": "width" must be a whole number from 240 to 2560');
    expect(message).toMatch(/- Error: Frame "checkout": .*page/);
  });

  it("should refuse a frame with no usable id and say what an id looks like", () => {
    expect(refusalOf(() => saveFrame(three, frame("Checkout Page")))).toContain('"id" must be up to 40 lowercase letters');
    expect(refusalOf(() => saveFrame(three, { name: "No id", width: 390, spec: heading("x") }))).toContain('"id" is missing');
  });

  it("should refuse something that is not a frame object", () => {
    expect(refusalOf(() => saveFrame(three, "home"))).toMatch(/^`frame` must be one frame object/);
    expect(refusalOf(() => saveFrame(three, [frame("a")]))).toMatch(/^`frame` must be one frame object/);
  });

  it("should refuse a place that names no frame, the frame itself, or both kinds of place", () => {
    expect(refusalOf(() => saveFrame(three, frame("checkout"), { after: "nowhere" }))).toBe('`after` names "nowhere", and no frame has that id. The frames are: "home", "pricing", "sign-in".');
    expect(refusalOf(() => saveFrame(three, frame("home"), { after: "home" }))).toMatch(/^A frame cannot go after itself\./);
    expect(refusalOf(() => saveFrame(three, frame("checkout"), { after: "home", index: 1 }))).toMatch(/^Pass `after` or `index`, not both/);
  });

  it("should refuse a frame that takes the board past its frame limit", () => {
    const full = board(Array.from({ length: canvasLimits.maxFrames }, (_, index) => frame(`screen-${String(index + 1)}`)));
    const message = refusalOf(() => saveFrame(full, frame("one-more")));
    expect(message).toMatch(/^The canvas would not be valid with this frame\. Nothing was saved\./);
    expect(message).toContain("The canvas has 25 frames; the limit is 24.");
    // Replacing a frame of a full board is still fine.
    expect(saveFrame(full, frame("screen-3", { name: "Third" })).changed).toBe(true);
  });

  it("should refuse a frame that takes the board past its element limit, counting every frame", () => {
    const many = (count: number) => ({ version: 1, root: "page", elements: { page: { type: "Stack", props: {}, children: Array.from({ length: count }, (_, index) => `t${String(index)}`) }, ...Object.fromEntries(Array.from({ length: count }, (_, index) => [`t${String(index)}`, { type: "Text", props: { text: "x" } }])) } });
    const nearlyFull = board(Array.from({ length: 6 }, (_, index) => frame(`big-${String(index + 1)}`, { spec: many(498) })));
    expect(validateCanvas(nearlyFull).valid).toBe(true);
    expect(refusalOf(() => saveFrame(nearlyFull, frame("extra", { spec: many(20) })))).toMatch(/The canvas has 3,015 elements across its frames; the limit is 3,000\./);
  });

  it("should refuse to change a canvas that cannot be read", () => {
    expect(refusalOf(() => saveFrame("{}", frame("home")))).toMatch(/^This canvas cannot be read/);
  });
});

describe("updateFrame", () => {
  const spec = heading("pricing");

  it("should change the fields given and leave the spec and the other fields as written", () => {
    const edit = updateFrame(three, "pricing", { name: "Pricing, desktop", width: 1440, height: 900, padding: "none" });
    const frames = (JSON.parse(edit.content) as { frames: Record<string, unknown>[] }).frames;
    expect(frames[1]).toEqual({ id: "pricing", name: "Pricing, desktop", width: 1440, spec, height: 900, padding: "none" });
    expect([frames[0], frames[2]]).toEqual([frame("home"), frame("sign-in")]);
    expect(edit).toMatchObject({ frameId: "pricing", added: false, changed: true });
  });

  it("should remove an optional field when it is null, so the frame follows its content or the board places it", () => {
    const placed = board([frame("home", { height: 900, padding: "lg", x: 100, y: 200 })]);
    const edit = updateFrame(placed, "home", { height: null, padding: null, x: null, y: null });
    expect((JSON.parse(edit.content) as { frames: unknown[] }).frames[0]).toEqual(frame("home"));
    expect(boardOutline(edit.content).frames[0]).toMatchObject({ height: null, padding: "md", position: { x: 0, y: 0, auto: true } });
  });

  it("should move the frame in the order when a place is given, with or without other changes", () => {
    expect(idsOf(updateFrame(three, "sign-in", {}, { index: 0 }).content)).toEqual(["sign-in", "home", "pricing"]);
    expect(idsOf(updateFrame(three, "home", { name: "Home, last" }, { after: "sign-in" }).content)).toEqual(["pricing", "sign-in", "home"]);
    // `index` counts among the other frames: 1 puts it second.
    expect(idsOf(updateFrame(three, "sign-in", {}, { index: 1 }).content)).toEqual(["home", "sign-in", "pricing"]);
  });

  it("should report nothing to save when the frame already has those values and that place", () => {
    expect(updateFrame(three, "pricing", { width: 390 }).changed).toBe(false);
    expect(updateFrame(three, "pricing", {}, { after: "home" }).changed).toBe(false);
  });

  it("should refuse values a frame cannot have and say what it can", () => {
    expect(refusalOf(() => updateFrame(three, "pricing", { width: 99_999 }))).toMatch(/^The frame would not be valid with these changes\. Nothing was saved\.[\s\S]*Frame "pricing": "width" must be a whole number from 240 to 2560/);
    expect(refusalOf(() => updateFrame(three, "pricing", { padding: "huge" }))).toContain('"padding" must be one of "none", "sm", "md", "lg".');
    expect(refusalOf(() => updateFrame(three, "pricing", { x: 100 }))).toContain('"x" and "y" must both be whole numbers');
    expect(refusalOf(() => updateFrame(three, "pricing", { name: "   " }))).toContain('"name" is missing');
  });

  it("should refuse when there is nothing to change, or no such frame", () => {
    expect(refusalOf(() => updateFrame(three, "pricing", {}))).toBe("Nothing to change. Pass at least one of name, width, height, padding, x, y, after, or index.");
    expect(refusalOf(() => updateFrame(three, "checkout", { name: "Checkout" }))).toMatch(/^No frame has the id "checkout"\./);
  });
});

describe("deleteFrame", () => {
  it("should remove the frame and keep the others in order", () => {
    const edit = deleteFrame(three, "pricing");
    expect(idsOf(edit.content)).toEqual(["home", "sign-in"]);
    expect(edit).toMatchObject({ frameId: "pricing", added: false, changed: true });
  });

  it("should leave a valid empty canvas when the last frame goes", () => {
    const edit = deleteFrame(board([frame("home")]), "home");
    expect(JSON.parse(edit.content)).toEqual({ version: 1, frames: [] });
    expect(validateCanvas(edit.content).valid).toBe(true);
  });

  it("should refuse when no frame has that id", () => {
    expect(refusalOf(() => deleteFrame(three, "checkout"))).toMatch(/^No frame has the id "checkout"\. The frames are: "home", "pricing", "sign-in"\.$/);
  });
});
