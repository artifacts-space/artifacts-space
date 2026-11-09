import { describe, expect, it } from "vitest";

import { shownFullWidth } from "./full-width-rules";

describe("shownFullWidth", () => {
  it("should show the page's width when an older editor copy still says contained", () => {
    // The width save refreshed the page to full width; an autosave read before it handed over a contained copy.
    expect(shownFullWidth(true, false)).toBe(true);
  });

  it("should show the page's width when an older editor copy still says full width", () => {
    expect(shownFullWidth(false, true)).toBe(false);
  });

  it("should show the followed width when no page width is passed", () => {
    expect(shownFullWidth(undefined, true)).toBe(true);
    expect(shownFullWidth(undefined, false)).toBe(false);
  });
});
