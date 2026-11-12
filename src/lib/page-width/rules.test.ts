import { describe, expect, it } from "vitest";

import { editColumnClass, hasWidthSetting, pageColumnClass, previewColumnClass, bodyFillsColumnClass, usesFullWidth } from "./rules";

/** Side padding classes, with or without a breakpoint prefix. */
const sidePadding = /^(\w+:)?px-/;

describe("pageColumnClass", () => {
  it("should keep the 1024px reading column when the artifact is contained", () => {
    expect(pageColumnClass(false)).toBe("max-w-5xl px-6");
  });

  it("should drop the column cap and keep side padding when the artifact is full width", () => {
    const classes = pageColumnClass(true).split(" ");
    expect(classes).toContain("max-w-none");
    expect(classes).toContain("px-6");
    expect(classes.some((name) => name.startsWith("max-w-5xl"))).toBe(false);
  });

  it("should pad full width no more than contained below the xl breakpoint, so Full width never narrows the page", () => {
    const contained = pageColumnClass(false).split(" ").filter((name) => sidePadding.test(name));
    const full = pageColumnClass(true).split(" ").filter((name) => sidePadding.test(name));
    expect(contained).toEqual(["px-6"]);
    expect(full.filter((name) => !name.startsWith("xl:"))).toEqual(contained);
  });
});

describe("bodyFillsColumnClass", () => {
  it("should lift the 72ch cap of Markdown and plain text when the body sits in a page column", () => {
    expect(bodyFillsColumnClass).toBe("[--artifact-measure:none]");
  });
});

describe("previewColumnClass", () => {
  it("should hold the whole preview to the public page's centered 1024px column when the artifact is contained", () => {
    const classes = previewColumnClass(false).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["mx-auto", "w-full", "max-w-5xl", "px-6"]));
  });

  it("should let the body's text fill the column when the artifact is contained, so it ends where the title ends", () => {
    // Fails if Markdown text stops at 72ch while the title and summary above it run to the column's edge.
    expect(previewColumnClass(false).split(" ")).toContain(bodyFillsColumnClass);
  });

  it("should use the whole pane and let the body's text fill it when the artifact is full width", () => {
    const classes = previewColumnClass(true).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["max-w-none", "px-6", bodyFillsColumnClass]));
    expect(classes.some((name) => name.startsWith("max-w-5xl"))).toBe(false);
  });

  it("should give the contained preview exactly the public page's column", () => {
    for (const name of pageColumnClass(false).split(" ")) expect(previewColumnClass(false).split(" ")).toContain(name);
  });

  it("should keep only the page's base padding when full width, since a pane is narrower than the window", () => {
    const classes = previewColumnClass(true).split(" ");
    expect(classes).toContain("px-6");
    expect(classes.some((name) => name.startsWith("lg:px-"))).toBe(false);
  });
});

describe("editColumnClass", () => {
  it("should keep the source field to the 1024px column when the artifact is contained", () => {
    expect(editColumnClass(false).split(" ")).toEqual(expect.arrayContaining(["mx-auto", "max-w-5xl"]));
  });

  it("should let the source field span the pane when the artifact is full width", () => {
    expect(editColumnClass(true)).not.toContain("max-w-5xl");
  });
});

describe("usesFullWidth", () => {
  it("should always use the whole width when the artifact is a CSV", () => {
    expect(usesFullWidth("csv", false)).toBe(true);
    expect(usesFullWidth("csv", true)).toBe(true);
  });

  it("should follow the Full width setting when the artifact is not a CSV", () => {
    expect(usesFullWidth("markdown", false)).toBe(false);
    expect(usesFullWidth("markdown", true)).toBe(true);
  });
});

describe("hasWidthSetting", () => {
  it("should offer the Full width setting only when it changes the page", () => {
    expect(hasWidthSetting("csv")).toBe(false);
    expect(hasWidthSetting("ui")).toBe(true);
  });
});
