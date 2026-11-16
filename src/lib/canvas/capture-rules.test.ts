import { describe, expect, it } from "vitest";

import {
  CAPTURE_REVISION,
  captureAvailability,
  captureGeometry,
  captureHashInput,
  captureLimits,
  captureModesFor,
  captureObjectKey,
  captureObjectKeys,
  countsTowardStorage,
  fitsCanvasCap,
  neededDrawings,
  partBox,
  partsProblem,
  removalIsFinal,
  type CaptureHashInput,
  type CaptureRowFacts,
} from "./capture-rules";

const patches = (width: number, height: number) => Math.ceil(width / captureLimits.patchPixels) * Math.ceil(height / captureLimits.patchPixels);

describe("captureGeometry", () => {
  it.each([
    { width: 390, columns: 1, partWidth: 390, partHeight: 1568 },
    { width: 768, columns: 1, partWidth: 768, partHeight: 1568 },
    { width: 1440, columns: 1, partWidth: 1440, partHeight: 840 },
    { width: 2560, columns: 2, partWidth: 1308, partHeight: 924 },
  ])("should cut a $width pixel frame into $columns column(s) of $partWidth x $partHeight parts when it is tall", ({ width, columns, partWidth, partHeight }) => {
    expect(captureGeometry(width, 100_000)).toMatchObject({ columns, partWidth, partHeight });
  });

  it("should keep every part within what a model reads at full size when the frame has any allowed width", () => {
    for (let width = 240; width <= 2560; width += 1) {
      const geometry = captureGeometry(width, 100_000);
      expect(patches(geometry.partWidth, geometry.partHeight)).toBeLessThanOrEqual(captureLimits.maxPatches);
      expect(Math.max(geometry.partWidth, geometry.partHeight)).toBeLessThanOrEqual(captureLimits.maxPatches);
      expect(geometry.partCount).toBeLessThanOrEqual(captureLimits.maxParts);
    }
  });

  it("should draw one part of the frame's own height when the frame fits in a part", () => {
    expect(captureGeometry(1440, 600)).toEqual({ columns: 1, partWidth: 1440, partHeight: 840, rows: 1, partCount: 1, drawnHeight: 600 });
    expect(captureGeometry(1440, 840)).toMatchObject({ rows: 1, drawnHeight: 840 });
  });

  it("should add a part for each stride when the frame is taller than a part", () => {
    expect(captureGeometry(1440, 841)).toMatchObject({ rows: 2, partCount: 2, drawnHeight: 841 });
    expect(captureGeometry(1440, 840 + 784)).toMatchObject({ rows: 2, drawnHeight: 1624 });
    expect(captureGeometry(1440, 840 + 784 + 1)).toMatchObject({ rows: 3 });
  });

  it("should stop at 12 parts and say how much it drew when the frame is taller than they cover", () => {
    expect(captureGeometry(1440, 9464)).toMatchObject({ rows: 12, partCount: 12, drawnHeight: 9464 });
    expect(captureGeometry(1440, 40_000)).toMatchObject({ rows: 12, partCount: 12, drawnHeight: 9464 });
    // Two columns: six rows of two parts.
    expect(captureGeometry(2560, 40_000)).toMatchObject({ rows: 6, partCount: 12, drawnHeight: 924 + 5 * (924 - 56) });
  });

  it("should use two columns only when the frame is wider than a part may be", () => {
    expect(captureGeometry(1568, 500)).toMatchObject({ columns: 1, partWidth: 1568, partHeight: 784 });
    expect(captureGeometry(1569, 500)).toMatchObject({ columns: 2, partWidth: 813 });
  });
});

describe("partBox", () => {
  it("should repeat the last 56 pixels of the part above when the frame has several rows", () => {
    const geometry = captureGeometry(1440, 2000);
    expect(partBox(geometry, 1440, 1)).toEqual({ x: 0, y: 0, width: 1440, height: 840 });
    expect(partBox(geometry, 1440, 2)).toEqual({ x: 0, y: 784, width: 1440, height: 840 });
    expect(partBox(geometry, 1440, 3)).toEqual({ x: 0, y: 1568, width: 1440, height: 432 });
  });

  it("should number parts left to right, then top to bottom, when the frame has two columns", () => {
    const geometry = captureGeometry(2560, 1000);
    expect(partBox(geometry, 2560, 1)).toEqual({ x: 0, y: 0, width: 1308, height: 924 });
    expect(partBox(geometry, 2560, 2)).toEqual({ x: 1252, y: 0, width: 1308, height: 924 });
    expect(partBox(geometry, 2560, 3)).toEqual({ x: 0, y: 868, width: 1308, height: 132 });
    expect(partBox(geometry, 2560, 4)).toEqual({ x: 1252, y: 868, width: 1308, height: 132 });
  });

  it("should cover every pixel of the drawn height and width when the parts are put together", () => {
    for (const [width, height] of [[390, 5000], [1440, 9464], [2560, 3333], [1569, 2000]] as const) {
      const geometry = captureGeometry(width, height);
      const boxes = Array.from({ length: geometry.partCount }, (_, index) => partBox(geometry, width, index + 1));
      const last = boxes.at(-1);
      expect((last?.y ?? 0) + (last?.height ?? 0)).toBe(geometry.drawnHeight);
      expect(Math.max(...boxes.map((box) => (box?.x ?? 0) + (box?.width ?? 0)))).toBe(width);
      // The last row always shows more than the shared pixels.
      expect(last?.height ?? 0).toBeGreaterThan(captureLimits.overlapPixels);
    }
  });

  it("should have no box when the part is not one of the drawing's", () => {
    const geometry = captureGeometry(1440, 600);
    expect(partBox(geometry, 1440, 0)).toBeNull();
    expect(partBox(geometry, 1440, 2)).toBeNull();
    expect(partBox(geometry, 1440, 1.5)).toBeNull();
  });
});

describe("partsProblem", () => {
  const geometry = captureGeometry(1440, 2000);
  const part = (bytes: number, contentType = "image/webp") => ({ bytes, contentType });

  it("should accept parts when their count, types, and sizes fit the drawing", () => {
    expect(partsProblem(geometry, [part(1000), part(2000), part(3000)])).toBeNull();
    expect(partsProblem(geometry, [part(1000, "image/jpeg"), part(2000, "image/jpeg"), part(captureLimits.maxPartBytes, "image/jpeg")])).toBeNull();
  });

  it("should refuse parts when there are more or fewer than the frame is drawn in", () => {
    expect(partsProblem(geometry, [part(1000), part(2000)])).toContain("3 parts");
    expect(partsProblem(geometry, [part(1000), part(2000), part(3000), part(4000)])).toContain("3 parts");
  });

  it("should refuse parts when a type is not allowed or the types differ", () => {
    expect(partsProblem(geometry, [part(1000, "image/png"), part(2000, "image/png"), part(3000, "image/png")])).not.toBeNull();
    expect(partsProblem(geometry, [part(1000), part(2000, "image/jpeg"), part(3000)])).not.toBeNull();
  });

  it("should refuse parts when one is empty or over the size cap", () => {
    expect(partsProblem(geometry, [part(1000), part(0), part(3000)])).not.toBeNull();
    expect(partsProblem(geometry, [part(1000), part(captureLimits.maxPartBytes + 1), part(3000)])).not.toBeNull();
  });
});

describe("captureObjectKey", () => {
  it("should put the capture's own id in every key so two captures never share one", () => {
    expect(captureObjectKey("art-1", "cap-1", 3)).toBe("captures/art-1/cap-1/3");
    expect(captureObjectKeys("art-1", "cap-1", 2)).toEqual(["captures/art-1/cap-1/1", "captures/art-1/cap-1/2"]);
    expect(captureObjectKeys("art-1", "cap-2", 2)).not.toEqual(captureObjectKeys("art-1", "cap-1", 2));
  });
});

describe("captureHashInput", () => {
  const base: CaptureHashInput = {
    width: 1440,
    height: null,
    padding: "md",
    spec: { version: 1, root: "page", elements: { page: { type: "Box", props: { gap: "md" }, children: ["title"] }, title: { type: "Heading", props: { text: "Home", level: 1 } } } },
    theme: { version: 1, mode: "auto", radius: "md" },
    mode: "light",
    files: [{ id: "b", attached: true, key: "files/b/b.png", name: "b.png", size: 20, type: "image/png" }, { id: "a", attached: false }],
  };
  const text = (change: Partial<CaptureHashInput> = {}) => captureHashInput({ ...base, ...change });

  it("should give the same text when the same content is written with its keys and files in another order", () => {
    const reordered: CaptureHashInput = {
      ...base,
      spec: { elements: { title: { props: { level: 1, text: "Home" }, type: "Heading" }, page: { children: ["title"], props: { gap: "md" }, type: "Box" } }, root: "page", version: 1 },
      theme: { radius: "md", mode: "auto", version: 1 },
      files: [...base.files].reverse(),
    };
    expect(captureHashInput(reordered)).toBe(text());
  });

  it("should change when anything that decides the pixels changes", () => {
    const changes: Partial<CaptureHashInput>[] = [
      { width: 768 },
      { height: 900 },
      { padding: "none" },
      { mode: "dark" },
      { theme: { version: 1, mode: "auto", radius: "lg" } },
      { spec: { version: 1, root: "page", elements: { page: { type: "Box", props: { gap: "md" }, children: ["title"] }, title: { type: "Heading", props: { text: "Start", level: 1 } } } } },
      // A replaced file has a new object, a renamed one a new name, and a detached one shows a notice.
      { files: [{ id: "b", attached: true, key: "files/b2/b.png", name: "b.png", size: 20, type: "image/png" }, { id: "a", attached: false }] },
      { files: [{ id: "b", attached: true, key: "files/b/b.png", name: "c.png", size: 20, type: "image/png" }, { id: "a", attached: false }] },
      { files: [{ id: "b", attached: true, key: "files/b/b.png", name: "b.png", size: 21, type: "image/png" }, { id: "a", attached: false }] },
      { files: [{ id: "b", attached: false }, { id: "a", attached: false }] },
      { files: [] },
    ];
    const texts = new Set(changes.map((change) => text(change)));
    expect(texts.size).toBe(changes.length);
    expect(texts.has(text())).toBe(false);
  });

  it("should keep the order of lists, since the order of children decides the layout", () => {
    const swapped = { version: 1, root: "page", elements: { page: { type: "Box", children: ["b", "a"] } } };
    const straight = { version: 1, root: "page", elements: { page: { type: "Box", children: ["a", "b"] } } };
    expect(text({ spec: swapped })).not.toBe(text({ spec: straight }));
  });

  it("should carry the capture revision so a new one draws every frame again", () => {
    expect(JSON.parse(text() ?? "{}")).toMatchObject({ revision: CAPTURE_REVISION });
  });

  it("should give no text when the spec nests too deep to write out", () => {
    let deep: unknown = "end";
    for (let level = 0; level < 20_000; level += 1) deep = { child: deep };
    expect(text({ spec: deep })).toBeNull();
  });
});

describe("captureModesFor", () => {
  it("should draw both modes when the theme follows the reader, and one when it pins a mode", () => {
    expect(captureModesFor("auto")).toEqual(["light", "dark"]);
    expect(captureModesFor("light")).toEqual(["light"]);
    expect(captureModesFor("dark")).toEqual(["dark"]);
  });
});

describe("captureAvailability", () => {
  it("should be on when nothing turns it off and storage is set up", () => {
    expect(captureAvailability({}, true)).toBe("on");
    expect(captureAvailability({ FRAME_CAPTURES: "on", VERCEL_ENV: "production" }, true)).toBe("on");
  });

  it("should be off when the switch says off, however it is written", () => {
    expect(captureAvailability({ FRAME_CAPTURES: "off" }, true)).toBe("off");
    expect(captureAvailability({ FRAME_CAPTURES: " OFF " }, true)).toBe("off");
  });

  it("should be off on a preview deployment, which shares the production database", () => {
    expect(captureAvailability({ VERCEL_ENV: "preview" }, true)).toBe("preview");
  });

  it("should be off when file storage is not set up", () => {
    expect(captureAvailability({}, false)).toBe("no-storage");
  });
});

describe("neededDrawings", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const board = [
    { frameHash: "a", mode: "light" },
    { frameHash: "a", mode: "dark" },
    { frameHash: "b", mode: "light" },
    { frameHash: "b", mode: "dark" },
  ] as const;
  const row = (frameHash: string, mode: "light" | "dark", status: CaptureRowFacts["status"], startedAt: Date): CaptureRowFacts => ({ frameHash, mode, status, startedAt });

  it("should list every drawing, light ones first, when the canvas has no captures", () => {
    expect(neededDrawings(board, [], now)).toEqual([board[0], board[2], board[1], board[3]]);
  });

  it("should leave out a drawing when a ready image of that content exists", () => {
    expect(neededDrawings(board, [row("a", "light", "ready", ago(86_400_000))], now)).toEqual([board[2], board[1], board[3]]);
  });

  it("should leave out a drawing when another tab started it within the claim time, and list it again after", () => {
    expect(neededDrawings(board, [row("b", "dark", "pending", ago(captureLimits.claimMs - 1))], now)).toEqual([board[0], board[2], board[1]]);
    expect(neededDrawings(board, [row("b", "dark", "pending", ago(captureLimits.claimMs))], now)).toHaveLength(4);
  });

  it("should still list a drawing when its only capture is removed or shows another mode", () => {
    expect(neededDrawings(board, [row("a", "light", "removed", ago(1000)), row("b", "light", "ready", ago(1000))], now)).toEqual([board[0], board[1], board[3]]);
  });

  it("should list a drawing once when two frames have the same content", () => {
    expect(neededDrawings([board[0], board[0], board[1]], [], now)).toEqual([board[0], board[1]]);
  });
});

describe("storage rules", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("should count ready captures and fresh pending ones, and nothing else", () => {
    expect(countsTowardStorage({ status: "ready", startedAt: ago(86_400_000) }, now)).toBe(true);
    expect(countsTowardStorage({ status: "pending", startedAt: ago(1000) }, now)).toBe(true);
    expect(countsTowardStorage({ status: "pending", startedAt: ago(captureLimits.pendingTtlMs) }, now)).toBe(false);
    expect(countsTowardStorage({ status: "removed", startedAt: ago(1000) }, now)).toBe(false);
  });

  it("should fit a capture only while the canvas stays within its cap", () => {
    expect(fitsCanvasCap(captureLimits.maxCanvasBytes - 10, 10)).toBe(true);
    expect(fitsCanvasCap(captureLimits.maxCanvasBytes - 10, 11)).toBe(false);
  });

  it("should let a removed row go only after its upload URLs have ended", () => {
    expect(removalIsFinal(ago(captureLimits.uploadUrlSeconds * 1000), now)).toBe(false);
    expect(removalIsFinal(ago(captureLimits.removalGraceMs), now)).toBe(true);
    expect(captureLimits.removalGraceMs).toBeGreaterThan(captureLimits.uploadUrlSeconds * 1000);
  });

  it("should bound a canvas by its cap, and always fit one drawing in an empty canvas", () => {
    // 24 frames, two modes, 12 parts each at the largest size is over the cap: the cap, not the part size, is what bounds a canvas.
    expect(24 * 2 * captureLimits.maxParts * captureLimits.maxPartBytes).toBeGreaterThan(captureLimits.maxCanvasBytes);
    // One drawing always fits an empty canvas.
    expect(fitsCanvasCap(0, captureLimits.maxParts * captureLimits.maxPartBytes)).toBe(true);
  });
});
