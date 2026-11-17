import { describe, expect, it } from "vitest";

import { blockLayout, restsInSource, selectionPlace } from "./mermaid-block-view";

describe("blockLayout", () => {
  it("should show only the source when the view is code", () => {
    expect(blockLayout("code", false)).toBe("code");
    expect(blockLayout("code", true)).toBe("code");
  });

  it("should show both sides when the view is split", () => {
    expect(blockLayout("split", false)).toBe("both");
  });

  it("should show only the diagram when the view is preview and nobody is editing its source", () => {
    expect(blockLayout("preview", false)).toBe("diagram");
  });

  it("should show the source beside the diagram when the view is preview and an editor needs the source", () => {
    expect(blockLayout("preview", true)).toBe("both");
  });
});

describe("restsInSource", () => {
  // A block at position 10 that is 20 long: its source runs from 11 to 29.
  const block = [10, 20] as const;

  it("should be true when the cursor is in the source, at either edge of it too", () => {
    expect(restsInSource(15, 15, ...block)).toBe(true);
    expect(restsInSource(11, 11, ...block)).toBe(true);
    expect(restsInSource(29, 29, ...block)).toBe(true);
  });

  it("should be true when a selection starts or ends in the source and runs past the block", () => {
    expect(restsInSource(15, 40, ...block)).toBe(true);
    expect(restsInSource(2, 15, ...block)).toBe(true);
  });

  it("should be false when a selection only covers the block, with both ends outside it", () => {
    expect(restsInSource(0, 60, ...block)).toBe(false);
    expect(restsInSource(60, 0, ...block)).toBe(false);
  });

  it("should be false when the cursor is before or after the block", () => {
    expect(restsInSource(10, 10, ...block)).toBe(false);
    expect(restsInSource(30, 30, ...block)).toBe(false);
  });
});

describe("selectionPlace", () => {
  const block = [10, 20] as const;

  it("should be in when the selection rests in the source", () => {
    expect(selectionPlace(15, 15, ...block)).toBe("in");
    expect(selectionPlace(15, 40, ...block)).toBe("in");
  });

  it("should be over when the selection covers the whole block from outside, in either direction", () => {
    expect(selectionPlace(0, 60, ...block)).toBe("over");
    expect(selectionPlace(60, 0, ...block)).toBe("over");
    expect(selectionPlace(10, 30, ...block)).toBe("over");
  });

  it("should be away when the selection stops before the block or starts after it", () => {
    expect(selectionPlace(2, 8, ...block)).toBe("away");
    expect(selectionPlace(30, 44, ...block)).toBe("away");
    expect(selectionPlace(10, 10, ...block)).toBe("away");
  });
});
