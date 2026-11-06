import { describe, expect, it } from "vitest";

import { checkSvg, svgDataUri, withSvgNamespace } from "./svg";

const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe("checkSvg", () => {
  it("should accept an svg document when it has a prologue", () => {
    expect(checkSvg(`<?xml version="1.0"?>\n<!-- art -->\n${circle}`).ok).toBe(true);
  });

  it("should accept a self-closing root when it has no content", () => {
    expect(checkSvg("<svg/>").ok).toBe(true);
  });

  it("should reject content when it does not start with an svg element", () => {
    expect(checkSvg("<div><svg></svg></div>").ok).toBe(false);
    expect(checkSvg("hello").ok).toBe(false);
  });

  it("should reject an svg when it never closes", () => {
    expect(checkSvg("<svg><circle/>").ok).toBe(false);
  });
});

describe("svgDataUri", () => {
  it("should build an encoded image data URI when given svg", () => {
    const uri = svgDataUri(circle);
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(uri.slice(uri.indexOf(",") + 1))).toBe(circle);
  });

  it("should encode characters that would end the attribute when present", () => {
    const uri = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg"><text>"#&<</text></svg>');
    expect(uri).not.toMatch(/["#<>]/);
  });

  it("should keep a script inert by encoding it inside the image URI", () => {
    const uri = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
    expect(uri).not.toContain("<script>");
  });
});

describe("withSvgNamespace", () => {
  it("should add the namespace when the root tag lacks it", () => {
    expect(withSvgNamespace('<svg viewBox="0 0 1 1"></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
  });

  it("should leave the source alone when the namespace is present", () => {
    expect(withSvgNamespace(circle)).toBe(circle);
  });
});
