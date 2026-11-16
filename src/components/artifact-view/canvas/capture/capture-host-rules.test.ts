import { describe, expect, it } from "vitest";

import { captureLimits } from "@/lib/canvas/capture-rules";

import {
  asksAgain,
  attemptKey,
  countLeftOut,
  encodeQualities,
  encodeWithin,
  leftOutTotal,
  leftOutWords,
  maxBatchesPerPass,
  mayDraw,
  minDrawingWindowWidth,
  ownSaveWaits,
  picturesInSpec,
  planDrawing,
  returnQuietMs,
  startsPass,
  untriedDrawings,
  type EncodedPart,
  type PartEncoder,
} from "./capture-host-rules";

const here = { saveData: false, windowWidth: 1280, visible: true };

describe("mayDraw", () => {
  it("should draw when the tab is visible, wide enough, and not saving data", () => {
    expect(mayDraw(here)).toBe(true);
    expect(mayDraw({ ...here, windowWidth: minDrawingWindowWidth })).toBe(true);
  });

  it("should not draw when the device asks to save data, the window is narrow, or the tab is hidden", () => {
    expect(mayDraw({ ...here, saveData: true })).toBe(false);
    expect(mayDraw({ ...here, windowWidth: minDrawingWindowWidth - 1 })).toBe(false);
    expect(mayDraw({ ...here, visible: false })).toBe(false);
  });
});

describe("startsPass", () => {
  const idle = { running: false, lastStartedAt: null };

  it("should start a pass when the canvas opens and none ran before", () => {
    expect(startsPass("open", idle, 1_000)).toBe(true);
    expect(startsPass("return", idle, 1_000)).toBe(true);
  });

  it("should start nothing while a pass runs, whatever the signal", () => {
    const running = { running: true, lastStartedAt: 0 };
    expect(startsPass("open", running, 60_000)).toBe(false);
    expect(startsPass("return", running, 60_000)).toBe(false);
    expect(startsPass("after-save", running, 60_000)).toBe(false);
  });

  it("should drop a second return signal when it comes within five seconds of the last pass", () => {
    const earlier = { running: false, lastStartedAt: 10_000 };
    expect(startsPass("return", earlier, 10_000 + returnQuietMs - 1)).toBe(false);
    expect(startsPass("return", earlier, 10_000 + returnQuietMs)).toBe(true);
  });

  it("should start a pass after a save even when one just ended", () => {
    expect(startsPass("after-save", { running: false, lastStartedAt: 10_000 }, 10_001)).toBe(true);
    expect(startsPass("open", { running: false, lastStartedAt: 10_000 }, 10_001)).toBe(true);
  });
});

describe("ownSaveWaits", () => {
  it("should wait when the artifact was saved since the last pass began", () => {
    expect(ownSaveWaits("2026-11-16T10:00:05.000Z", "2026-11-16T10:00:00.000Z")).toBe(true);
    expect(ownSaveWaits("2026-11-16T10:00:05.000Z", null)).toBe(true);
  });

  it("should not wait when nothing was saved since, or nothing is saved at all", () => {
    expect(ownSaveWaits("2026-11-16T10:00:00.000Z", "2026-11-16T10:00:00.000Z")).toBe(false);
    expect(ownSaveWaits(null, null)).toBe(false);
    expect(ownSaveWaits(null, "2026-11-16T10:00:00.000Z")).toBe(false);
  });
});

describe("untriedDrawings", () => {
  const light = (hash: string) => ({ frameHash: hash, mode: "light" as const });
  const dark = (hash: string) => ({ frameHash: hash, mode: "dark" as const });
  const frames = [
    { name: "home", drawings: [light("a"), dark("a")] },
    { name: "pricing", drawings: [light("b")] },
  ];

  it("should list every drawing with its frame, in order, when the pass tried none", () => {
    expect(untriedDrawings(frames, new Set()).map((item) => `${item.frame.name}:${attemptKey(item.drawing)}`)).toEqual(["home:a:light", "home:a:dark", "pricing:b:light"]);
  });

  it("should leave out a drawing the pass already tried, so a drawing that failed is not drawn again in the same pass", () => {
    const tried = new Set([attemptKey(light("a")), attemptKey(light("b"))]);
    expect(untriedDrawings(frames, tried).map((item) => attemptKey(item.drawing))).toEqual(["a:dark"]);
    expect(untriedDrawings(frames, new Set([...tried, attemptKey(dark("a"))]))).toEqual([]);
  });

  it("should list a drawing once when two frames share it", () => {
    const shared = [{ drawings: [light("a")] }, { drawings: [light("a"), dark("a")] }];
    expect(untriedDrawings(shared, new Set()).map((item) => attemptKey(item.drawing))).toEqual(["a:light", "a:dark"]);
  });
});

describe("asksAgain", () => {
  it("should ask again after a batch that held something new", () => {
    expect(asksAgain(1, true)).toBe(true);
    expect(asksAgain(maxBatchesPerPass - 1, true)).toBe(true);
  });

  it("should end the pass when a batch held nothing new, or at the batch limit", () => {
    expect(asksAgain(1, false)).toBe(false);
    expect(asksAgain(maxBatchesPerPass, true)).toBe(false);
  });
});

describe("picturesInSpec", () => {
  const spec = JSON.stringify({
    root: "page",
    elements: {
      page: { type: "Stack", props: {}, children: ["one", "again", "card", "gone", "odd"] },
      one: { type: "Image", props: { file: "AAAA", alt: "One" } },
      again: { type: "Image", props: { file: " aaaa ", alt: "One again" } },
      card: { type: "File", props: { file: "bbbb" } },
      gone: { type: "Image", props: { file: "cccc", alt: "Not attached" } },
      odd: { type: "Image", props: { file: 7 } },
    },
  });

  it("should name each attached file an Image shows once, by its lowercase id", () => {
    expect(picturesInSpec(spec, new Set(["aaaa", "bbbb"]))).toEqual(["aaaa"]);
  });

  it("should name none for a File card, a file that is not attached, or a spec that cannot be read", () => {
    expect(picturesInSpec(spec, new Set(["bbbb"]))).toEqual([]);
    expect(picturesInSpec("{", new Set(["aaaa"]))).toEqual([]);
    expect(picturesInSpec(JSON.stringify({ elements: [] }), new Set(["aaaa"]))).toEqual([]);
  });
});

describe("planDrawing", () => {
  it("should round a measured height up to whole pixels and give one part when the frame fits", () => {
    expect(planDrawing(1440, 823.4)).toEqual({ height: 824, drawnHeight: 824, parts: [{ x: 0, y: 0, width: 1440, height: 824 }] });
    expect(planDrawing(390, 0).height).toBe(1);
  });

  it("should cut a tall desktop frame into parts that share 56 pixels", () => {
    const plan = planDrawing(1440, 2000);
    expect(plan.parts).toEqual([
      { x: 0, y: 0, width: 1440, height: 840 },
      { x: 0, y: 784, width: 1440, height: 840 },
      { x: 0, y: 1568, width: 1440, height: 432 },
    ]);
    expect(plan.drawnHeight).toBe(2000);
  });

  it("should cut a frame wider than a part into two columns", () => {
    const plan = planDrawing(2560, 900);
    expect(plan.parts).toEqual([
      { x: 0, y: 0, width: 1308, height: 900 },
      { x: 1252, y: 0, width: 1308, height: 900 },
    ]);
  });

  it("should stop at the most parts a drawing may have, and say how much it covers, when the frame is taller", () => {
    const plan = planDrawing(1440, 40_000);
    expect(plan.parts).toHaveLength(captureLimits.maxParts);
    expect(plan.height).toBe(40_000);
    expect(plan.drawnHeight).toBe(840 + 11 * 784);
    expect(plan.parts.at(-1)).toEqual({ x: 0, y: 11 * 784, width: 1440, height: 840 });
  });
});

describe("encodeWithin", () => {
  /** An encoder that gives back `type` at the sizes listed, one per quality tried. */
  function encoder(type: string, sizes: readonly number[]): { encode: PartEncoder<string>; asked: number[] } {
    const asked: number[] = [];
    const encode: PartEncoder<string> = (_type, quality) => {
      const bytes = sizes[asked.length] ?? 0;
      asked.push(quality);
      return Promise.resolve<EncodedPart<string>>({ type, bytes, data: `q${String(quality)}` });
    };
    return { encode, asked };
  }

  it("should keep the best quality when the part fits at once", async () => {
    const { encode, asked } = encoder("image/webp", [200_000]);
    expect(await encodeWithin(encode, "image/webp")).toEqual({ state: "fits", part: { type: "image/webp", bytes: 200_000, data: "q0.9" } });
    expect(asked).toEqual([0.9]);
  });

  it("should step the quality down until the part fits", async () => {
    const { encode, asked } = encoder("image/webp", [400_000, 350_000, captureLimits.maxPartBytes]);
    expect(await encodeWithin(encode, "image/webp")).toMatchObject({ state: "fits", part: { bytes: captureLimits.maxPartBytes, data: "q0.7" } });
    expect(asked).toEqual([...encodeQualities]);
  });

  it("should say too-large when the part does not fit at the lowest quality", async () => {
    const { encode } = encoder("image/webp", [400_000, 350_000, captureLimits.maxPartBytes + 1]);
    expect(await encodeWithin(encode, "image/webp")).toEqual({ state: "too-large" });
  });

  it("should say wrong-type when the browser writes another type than asked", async () => {
    const { encode, asked } = encoder("image/png", [1_000]);
    expect(await encodeWithin(encode, "image/webp")).toEqual({ state: "wrong-type" });
    expect(asked).toEqual([0.9]);
  });

  it("should say failed, not wrong-type, when the browser gives no picture at any quality", async () => {
    const asked: number[] = [];
    const none: PartEncoder<string> = (_type, quality) => {
      asked.push(quality);
      return Promise.resolve(null);
    };
    expect(await encodeWithin(none, "image/jpeg")).toEqual({ state: "failed" });
    expect(asked).toEqual([...encodeQualities]);
  });

  it("should ask at the next quality when the browser gives no picture at one", async () => {
    let calls = 0;
    const flaky: PartEncoder<string> = (type, quality) => {
      calls += 1;
      return Promise.resolve(calls === 1 ? null : { type, bytes: 1_000, data: `q${String(quality)}` });
    };
    expect(await encodeWithin(flaky, "image/webp")).toEqual({ state: "fits", part: { type: "image/webp", bytes: 1_000, data: "q0.8" } });
  });

  it("should say too-large when a picture came out at some quality but none fits", async () => {
    let calls = 0;
    const big: PartEncoder<string> = (type) => {
      calls += 1;
      return Promise.resolve(calls === 2 ? null : { type, bytes: captureLimits.maxPartBytes + 1, data: "big" });
    };
    expect(await encodeWithin(big, "image/webp")).toEqual({ state: "too-large" });
  });
});

describe("left-out counts", () => {
  it("should count drawings by reason and add them up", () => {
    const counts = countLeftOut(countLeftOut(countLeftOut({}, "too-large"), "error"), "too-large");
    expect(counts).toEqual({ "too-large": 2, error: 1 });
    expect(leftOutTotal(counts)).toBe(3);
    expect(leftOutTotal({})).toBe(0);
  });

  it("should word the counts with reasons and numbers only", () => {
    expect(leftOutWords({ "too-large": 2, error: 1 })).toBe("too-large 2, error 1");
    expect(leftOutWords({})).toBe("");
  });
});
