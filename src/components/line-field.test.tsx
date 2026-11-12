import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LineField, singleLine } from "./line-field";

const noop = () => undefined;

describe("singleLine", () => {
  it("should turn each line break into one space when text is pasted with breaks", () => {
    expect(singleLine("Room plans\nand moving")).toBe("Room plans and moving");
    expect(singleLine("Room plans\r\n\r\nand moving")).toBe("Room plans and moving");
  });

  it("should not leave extra spaces when a break has spaces around it", () => {
    expect(singleLine("Room plans  \n   and moving")).toBe("Room plans and moving");
  });

  it("should add no space when the pasted text starts or ends with a break", () => {
    expect(singleLine("Room plans\r\n")).toBe("Room plans");
    expect(singleLine("\n  Room plans\nand moving \n")).toBe("Room plans and moving");
  });

  it("should keep the text as written when it has no line break", () => {
    expect(singleLine("Room plans  and moving ")).toBe("Room plans  and moving ");
  });
});

describe("LineField", () => {
  it("should render a one-row field that grows with its text when given a long value", () => {
    const html = renderToStaticMarkup(<LineField value="A long title" onValueChange={noop} aria-label="Artifact title" className="text-3xl" />);
    expect(html).toContain("<textarea");
    expect(html).toContain('rows="1"');
    expect(html).toContain('aria-label="Artifact title"');
    expect(html).toContain("field-sizing-content");
    expect(html).toContain("text-3xl");
    expect(html).toContain("A long title");
  });
});
