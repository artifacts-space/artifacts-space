import { describe, expect, it } from "vitest";

import { COVER_MAX_BYTES, coverFileProblem, isCoverUploadAllowed } from "./cover-rules";

const editor = "user-1";
const ready = { status: "ready" as const, uploaderId: editor, artifactId: null, contentType: "image/jpeg", size: 400_000 };

describe("coverFileProblem", () => {
  it("should accept the editor's own finished image when it is not attached yet", () => {
    expect(coverFileProblem(ready, editor, null)).toBeNull();
    expect(coverFileProblem({ ...ready, artifactId: "art-1" }, editor, "art-1")).toBeNull();
  });

  it("should refuse an SVG even when everything else is right", () => {
    expect(coverFileProblem({ ...ready, contentType: "image/svg+xml" }, editor, null)).toMatch(/SVG is not allowed/);
  });

  it("should refuse a file the caller cannot use: someone else's upload or another artifact's file", () => {
    expect(coverFileProblem({ ...ready, uploaderId: "someone-else" }, editor, null)).toMatch(/another artifact or another person/);
    expect(coverFileProblem({ ...ready, artifactId: "art-2" }, editor, "art-1")).toMatch(/another artifact or another person/);
    expect(coverFileProblem({ ...ready, artifactId: "art-2" }, editor, null)).toMatch(/another artifact or another person/);
  });

  it("should refuse a missing, unfinished, non-image, or oversized file with a clear message", () => {
    expect(coverFileProblem(null, editor, null)).toMatch(/not found/);
    expect(coverFileProblem({ ...ready, status: "pending" }, editor, null)).toMatch(/still uploading/);
    expect(coverFileProblem({ ...ready, contentType: "application/pdf" }, editor, null)).toMatch(/PNG, JPEG/);
    expect(coverFileProblem({ ...ready, size: COVER_MAX_BYTES + 1 }, editor, null)).toMatch(/at most 2 MB/);
  });
});

describe("isCoverUploadAllowed", () => {
  it("should allow only image types within the cap when a file is picked", () => {
    expect(isCoverUploadAllowed({ type: "image/webp", size: 10 })).toBe(true);
    expect(isCoverUploadAllowed({ type: "image/svg+xml", size: 10 })).toBe(false);
    expect(isCoverUploadAllowed({ type: "image/png", size: COVER_MAX_BYTES + 1 })).toBe(false);
    expect(isCoverUploadAllowed({ type: "image/png", size: 0 })).toBe(false);
  });
});
