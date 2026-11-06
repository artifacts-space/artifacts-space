import { describe, expect, it } from "vitest";

import { artifactPreview, PREVIEW_CHARS } from "./artifact-preview";

describe("artifactPreview", () => {
  it("should keep the opening characters when the format is readable text", () => {
    const long = "a".repeat(PREVIEW_CHARS + 50);
    expect(artifactPreview("markdown", long)).toHaveLength(PREVIEW_CHARS);
    expect(artifactPreview("code", "const x = 1;")).toBe("const x = 1;");
  });

  it("should give no preview when the format is structured", () => {
    for (const kind of ["ui", "json", "svg", "file"]) expect(artifactPreview(kind, "{}")).toBe("");
  });
});
