import { describe, expect, it } from "vitest";

import { ICON_MAX_BYTES, iconFileProblem, isIconUploadAllowed, type IconFileSubject } from "./icon-rules";

const editor = "user-1";
const artifactId = "artifact-1";
const own: IconFileSubject = { status: "ready", uploaderId: editor, artifactId: null, contentType: "image/png", size: 2048 };

describe("iconFileProblem", () => {
  it("should accept the editor's own finished image when it is not attached yet", () => {
    expect(iconFileProblem(own, editor, artifactId)).toBeNull();
    expect(iconFileProblem(own, editor, null)).toBeNull();
  });

  it("should accept an image already attached to the same artifact, even a teammate's", () => {
    expect(iconFileProblem({ ...own, uploaderId: "teammate", artifactId }, editor, artifactId)).toBeNull();
  });

  it("should refuse a file that belongs to another artifact", () => {
    expect(iconFileProblem({ ...own, artifactId: "artifact-2" }, editor, artifactId)).toMatch(/another artifact/);
    expect(iconFileProblem({ ...own, artifactId: "artifact-2" }, editor, null)).toMatch(/another artifact/);
  });

  it("should refuse another user's unattached upload", () => {
    expect(iconFileProblem({ ...own, uploaderId: "someone-else" }, editor, artifactId)).toMatch(/another person/);
  });

  it.each(["application/pdf", "text/plain", "video/mp4", "application/zip"])("should refuse a non-image file of type %s", (contentType) => {
    expect(iconFileProblem({ ...own, contentType }, editor, artifactId)).toMatch(/PNG, JPEG/);
  });

  it("should refuse an SVG even when it is otherwise usable", () => {
    expect(iconFileProblem({ ...own, contentType: "image/svg+xml" }, editor, artifactId)).toMatch(/SVG is not allowed/);
  });

  it("should refuse an upload that is not finalized", () => {
    expect(iconFileProblem({ ...own, status: "pending" }, editor, artifactId)).toMatch(/still uploading/);
  });

  it("should refuse a file over 1 MB", () => {
    expect(iconFileProblem({ ...own, size: ICON_MAX_BYTES + 1 }, editor, artifactId)).toMatch(/at most 1 MB/);
    expect(iconFileProblem({ ...own, size: ICON_MAX_BYTES }, editor, artifactId)).toBeNull();
  });

  it("should refuse a missing file", () => {
    expect(iconFileProblem(null, editor, artifactId)).toMatch(/not found/);
  });
});

describe("isIconUploadAllowed", () => {
  it("should allow small images and refuse SVG, other types, empty, and oversize files", () => {
    expect(isIconUploadAllowed({ type: "image/webp", size: 10 })).toBe(true);
    expect(isIconUploadAllowed({ type: "image/svg+xml", size: 10 })).toBe(false);
    expect(isIconUploadAllowed({ type: "application/pdf", size: 10 })).toBe(false);
    expect(isIconUploadAllowed({ type: "image/png", size: 0 })).toBe(false);
    expect(isIconUploadAllowed({ type: "image/png", size: ICON_MAX_BYTES + 1 })).toBe(false);
  });
});
