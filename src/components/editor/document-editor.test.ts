import { describe, expect, it } from "vitest";

import { isDocumentKind } from "./document-editor";

describe("isDocumentKind", () => {
  it("should edit Markdown and Text as documents when the kind is one of them", () => {
    expect(isDocumentKind("markdown")).toBe(true);
    expect(isDocumentKind("text")).toBe(true);
  });

  it("should leave source formats to the source editor when the kind is anything else", () => {
    for (const kind of ["json", "code", "csv", "svg", "mermaid", "ui", "file"] as const) expect(isDocumentKind(kind)).toBe(false);
  });
});
