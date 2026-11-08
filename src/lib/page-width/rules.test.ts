import { describe, expect, it } from "vitest";

import { pageColumnClass, readingMeasureClass } from "./rules";

describe("pageColumnClass", () => {
  it("should keep the 960px reading column when the artifact is contained", () => {
    expect(pageColumnClass(false)).toBe("max-w-[960px] px-6");
  });

  it("should drop the column cap and keep side padding when the artifact is full width", () => {
    const classes = pageColumnClass(true).split(" ");
    expect(classes).toContain("max-w-none");
    expect(classes).toContain("px-6");
    expect(classes.some((name) => name.startsWith("max-w-[960px]"))).toBe(false);
  });
});

describe("readingMeasureClass", () => {
  it("should add nothing when the artifact is contained, so it looks as before", () => {
    expect(readingMeasureClass(false)).toBe("");
  });

  it("should lift the reading measure when the artifact is full width", () => {
    expect(readingMeasureClass(true)).toBe("[--artifact-measure:none]");
  });
});
