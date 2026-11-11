import { describe, expect, it } from "vitest";

import { blockLayout } from "./mermaid-block-view";

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
