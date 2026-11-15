import { describe, expect, it } from "vitest";

import { canvasLimits, frameIdPattern } from "./limits";
import { readCanvas } from "./read";

const spec = { version: 1, root: "page", elements: { page: { type: "Heading", props: { text: "Hello" } } } };
const frame = (id: unknown) => ({ id, name: "Home", width: 390, spec });
const read = (frames: readonly unknown[]) => readCanvas({ version: 1, frames }).frames;
const ids = (frames: readonly unknown[]) => read(frames).map((item) => item.id);
/** Each frame's messages, in order, so a clean frame reads as an empty list. */
const problems = (frames: readonly unknown[]) => read(frames).map((item) => item.issues.map((issue) => issue.message));

describe("frame ids: stand-ins", () => {
  it("should leave a later frame its own id when an earlier frame needs a stand-in", () => {
    const frames = [frame(""), frame("frame-1")];
    expect(ids(frames)).toEqual(["frame-1-2", "frame-1"]);
    expect(problems(frames)).toEqual([['Frame 1: "id" is empty. Give each frame a short id such as "home" or "checkout-phone".'], []]);
  });

  it("should leave a later frame its own id when a frame in the middle needs a stand-in", () => {
    const frames = [frame("home"), frame(""), frame("frame-2")];
    expect(ids(frames)).toEqual(["home", "frame-2-2", "frame-2"]);
    expect(problems(frames)[2]).toEqual([]);
  });

  it("should use the plain stand-in when no frame asks for it", () => {
    expect(ids([frame(""), frame("frame-2")])).toEqual(["frame-1", "frame-2"]);
  });

  it("should not hand out a stand-in that a later frame wrote as its id", () => {
    const frames = [frame("Home"), frame("frame-1")];
    expect(ids(frames)).toEqual(["frame-1-2", "frame-1"]);
    expect(problems(frames)[1]).toEqual([]);
  });

  it("should not hand out a stand-in that an earlier frame wrote as its id", () => {
    const frames = [frame("frame-2"), frame("")];
    expect(ids(frames)).toEqual(["frame-2", "frame-2-2"]);
    expect(problems(frames)[0]).toEqual([]);
  });

  it("should leave a later frame its own id when a value that is not a frame comes first", () => {
    const frames = ["not a frame", frame("frame-1")];
    expect(ids(frames)).toEqual(["frame-1-2", "frame-1"]);
    expect(problems(frames)[1]).toEqual([]);
  });

  it("should skip every id a frame wrote when the first stand-ins are all asked for", () => {
    expect(ids([frame(42), frame("frame-1"), frame("frame-1-2")])).toEqual(["frame-1-3", "frame-1", "frame-1-2"]);
  });

  it("should keep a stand-in within the id rule when frames wrote every id it would try first", () => {
    // Frame 1 has no usable id; the 23 others wrote "frame-1", then "frame-1-2" to "frame-1-23", the ids a stand-in tries in order.
    const wrote = ["frame-1", ...Array.from({ length: canvasLimits.maxFrames - 2 }, (_, index) => `frame-1-${String(index + 2)}`)];
    const given = ids([frame(""), ...wrote.map((id) => frame(id))]);
    expect(given).toEqual(["frame-1-24", ...wrote]);
    expect(given[0]?.length).toBeLessThanOrEqual(canvasLimits.maxIdLength);
    expect(given[0]).toMatch(frameIdPattern);
  });

  it("should keep every stand-in within the id rule when no frame on a full board has a usable id", () => {
    const given = ids(Array.from({ length: canvasLimits.maxFrames }, () => frame(null)));
    expect(new Set(given).size).toBe(canvasLimits.maxFrames);
    expect(given.every((id) => id.length <= canvasLimits.maxIdLength && frameIdPattern.test(id))).toBe(true);
  });

  it("should give every frame a different id when none of them has a usable one", () => {
    const given = ids([frame(undefined), frame(null), frame(""), frame(" "), "text", 7, null]);
    expect(given).toEqual(["frame-1", "frame-2", "frame-3", "frame-4", "frame-5", "frame-6", "frame-7"]);
  });
});

describe("frame ids: duplicates", () => {
  it("should let the first frame keep an id that two frames wrote", () => {
    const frames = [frame("home"), frame("home")];
    expect(ids(frames)).toEqual(["home", "frame-2"]);
    expect(problems(frames)).toEqual([[], ['Frame 2: another frame already has the id "home". Frame ids must be unique.']]);
  });

  it("should refuse each later frame when three frames wrote the same id", () => {
    const frames = [frame("home"), frame("home"), frame("home")];
    expect(ids(frames)).toEqual(["home", "frame-2", "frame-3"]);
    expect(problems(frames).map((list) => list.length)).toEqual([0, 1, 1]);
  });

  it("should keep the stand-in for a duplicate away from an id a later frame wrote", () => {
    const frames = [frame("home"), frame("home"), frame("frame-2")];
    expect(ids(frames)).toEqual(["home", "frame-2-2", "frame-2"]);
    expect(problems(frames)[2]).toEqual([]);
  });

  it("should not call an id a duplicate when it differs from another only by spaces or case", () => {
    const frames = [frame("home"), frame(" home "), frame("HOME")];
    expect(ids(frames)).toEqual(["home", "frame-2", "frame-3"]);
    expect(problems(frames).flat().join("\n")).not.toContain("already has the id");
  });
});

describe("frame ids: what is refused", () => {
  const rule = 'Frame 1: "id" must be up to 40 lowercase letters, digits, and hyphens, starting with a letter or digit, such as "checkout-phone".';
  const examples = 'Give each frame a short id such as "home" or "checkout-phone".';

  it.each([
    ["is left out", undefined, `Frame 1: "id" is missing. ${examples}`],
    ["is a number", 42, 'Frame 1: "id" must be a string, such as "checkout-phone".'],
    ["is null", null, 'Frame 1: "id" must be a string, such as "checkout-phone".'],
    ["is a list", ["home"], 'Frame 1: "id" must be a string, such as "checkout-phone".'],
    ["is empty text", "", `Frame 1: "id" is empty. ${examples}`],
    ["is only spaces", "   ", `Frame 1: "id" is empty. ${examples}`],
    ["has a space before or after it", " home ", rule],
    ["has a space inside it", "home page", rule],
    ["ends with a line break", "home\n", rule],
    ["has an uppercase letter", "Home", rule],
    ["starts with a hyphen", "-home", rule],
    ["has an underscore", "home_page", rule],
    ["has a letter outside a to z", "café", rule],
    ["is one character over the limit", "a".repeat(41), rule],
  ])("should refuse the id and give a stand-in when it %s", (_case, id, expected) => {
    const [first] = read([frame(id)]);
    expect(first?.id).toBe("frame-1");
    expect(first?.label).toBe("Frame 1");
    expect(first?.issues.map((issue) => issue.message)).toEqual([expected]);
    expect(first?.issues[0]).toMatchObject({ code: "invalid_frame", frameId: "frame-1", severity: "error" });
  });

  it.each([
    ["one letter", "a"],
    ["one digit", "7"],
    ["digits first", "404-page"],
    ["hyphens inside and at the end", "checkout--phone-"],
    ["the longest id allowed", "a".repeat(40)],
    ["a name every object has", "constructor"],
  ])("should keep the id as written when it is %s", (_case, id) => {
    const [first] = read([frame(id)]);
    expect(first?.id).toBe(id);
    expect(first?.label).toBe(`Frame "${id}"`);
    expect(first?.issues).toEqual([]);
  });
});
