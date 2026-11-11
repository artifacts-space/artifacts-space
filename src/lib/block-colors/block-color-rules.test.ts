import { describe, expect, it } from "vitest";

import { blockColorAttributes, colorChoiceLabel, colorMarker, hasBlockColors, parseColorMarker, readBlockColors, readBlockHue } from "./block-color-rules";

describe("parseColorMarker", () => {
  it("should read the text color and background from a color comment", () => {
    expect(parseColorMarker("<!-- color: red; background: blue -->")).toEqual({ color: "red", background: "blue" });
    expect(parseColorMarker("<!--background:green-->")).toEqual({ color: null, background: "green" });
    expect(parseColorMarker("<!-- Color: Red; -->")).toEqual({ color: "red", background: null });
  });

  it("should ignore unknown names and values that are not hues", () => {
    expect(parseColorMarker("<!-- color: teal; size: big -->")).toEqual({ color: null, background: null });
    expect(parseColorMarker("<!-- background: red; weight: 3 -->")).toEqual({ color: null, background: "red" });
  });

  it("should return null when the comment is not a color comment", () => {
    expect(parseColorMarker("<!-- TODO: check this -->")).toBeNull();
    expect(parseColorMarker("<!-- size: big -->")).toBeNull();
    expect(parseColorMarker("<!-- just a note -->")).toBeNull();
    expect(parseColorMarker("<b>bold</b>")).toBeNull();
    expect(parseColorMarker("<!-- color: red --> trailing")).toBeNull();
  });
});

describe("colorMarker", () => {
  it("should write color first, then background, and nothing for no colors", () => {
    expect(colorMarker({ color: "red", background: "blue" })).toBe("<!-- color: red; background: blue -->");
    expect(colorMarker({ color: null, background: "gray" })).toBe("<!-- background: gray -->");
    expect(colorMarker({ color: null, background: null })).toBe("");
  });

  it("should read back what it writes", () => {
    const colors = { color: "purple", background: "yellow" } as const;
    expect(parseColorMarker(colorMarker(colors))).toEqual(colors);
  });
});

describe("readBlockColors and blockColorAttributes", () => {
  it("should keep only hues when reading attributes", () => {
    expect(readBlockColors({ color: "pink", background: "nope" })).toEqual({ color: "pink", background: null });
    expect(readBlockColors(null)).toEqual({ color: null, background: null });
    expect(readBlockHue(42)).toBeNull();
    expect(hasBlockColors({ color: null, background: null })).toBe(false);
  });

  it("should give data- attributes only for set colors", () => {
    expect(blockColorAttributes({ color: "red", background: null })).toEqual({ "data-block-color": "red" });
    expect(blockColorAttributes({ color: null, background: null })).toEqual({});
  });
});

describe("colorChoiceLabel", () => {
  it("should spell out the part for search and accessible names", () => {
    expect(colorChoiceLabel("color", "red")).toBe("Red text");
    expect(colorChoiceLabel("background", "red")).toBe("Red background");
    expect(colorChoiceLabel("color", null)).toBe("Default text");
    expect(colorChoiceLabel("background", null)).toBe("Default background");
  });

  it("should shorten what a submenu row shows under its section label", () => {
    expect(colorChoiceLabel("color", "red", "inSection")).toBe("Red");
    expect(colorChoiceLabel("background", "red", "inSection")).toBe("Red background");
    expect(colorChoiceLabel("background", null, "inSection")).toBe("Default");
  });
});
