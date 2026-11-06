import { describe, expect, it } from "vitest";

import { checkUpload, fileCategory, fileLimits, formatBytes, isInlineType, resolveFileType } from "./config";

describe("resolveFileType", () => {
  it("should accept an allowed declared type and ignore its parameters", () => {
    expect(resolveFileType("a.png", "image/png")).toBe("image/png");
    expect(resolveFileType("a.txt", "text/plain; charset=utf-8")).toBe("text/plain");
  });

  it("should map aliases to the canonical type", () => {
    expect(resolveFileType("a.zip", "application/x-zip-compressed")).toBe("application/zip");
    expect(resolveFileType("a.wav", "audio/x-wav")).toBe("audio/wav");
    expect(resolveFileType("notes.md", "text/markdown")).toBe("text/plain");
  });

  it("should use the extension when the declared type is missing or generic", () => {
    expect(resolveFileType("deck.PPTX", "")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(resolveFileType("data.csv", "application/vnd.ms-excel")).toBe("text/csv");
    expect(resolveFileType("clip.mp4", undefined)).toBe("video/mp4");
  });

  it("should refuse types that are not allowed even when the extension is", () => {
    expect(resolveFileType("page.png", "text/html")).toBeNull();
    expect(resolveFileType("image.svg", "image/svg+xml")).toBeNull();
    expect(resolveFileType("run.exe", "")).toBeNull();
  });
});

describe("checkUpload", () => {
  it("should accept a file within the cap when its type is allowed", () => {
    expect(checkUpload({ filename: "a.pdf", contentType: "application/pdf", size: 1000 })).toEqual({ ok: true, contentType: "application/pdf" });
    expect(checkUpload({ filename: "a.pdf", contentType: "application/pdf", size: fileLimits.maxBytes }).ok).toBe(true);
  });

  it("should refuse empty files and files over the cap", () => {
    expect(checkUpload({ filename: "a.pdf", contentType: "application/pdf", size: 0 })).toEqual({ ok: false, error: "The file is empty. Choose a file with content." });
    expect(checkUpload({ filename: "a.pdf", contentType: "application/pdf", size: fileLimits.maxBytes + 1 })).toMatchObject({ ok: false, error: expect.stringContaining("The limit is 25 MB") as unknown });
    expect(checkUpload({ filename: "a.pdf", contentType: "application/pdf", size: 1.5 }).ok).toBe(false);
  });

  it("should refuse a type that is not allowed", () => {
    expect(checkUpload({ filename: "a.html", contentType: "text/html", size: 10 })).toMatchObject({ ok: false });
  });
});

describe("isInlineType", () => {
  it("should show images, pdf, video, audio, and plain text inline", () => {
    for (const type of ["image/png", "image/avif", "application/pdf", "video/webm", "audio/mpeg", "text/plain"]) expect(isInlineType(type)).toBe(true);
  });

  it("should download everything else as an attachment", () => {
    for (const type of ["text/csv", "application/json", "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/html", "image/svg+xml", ""]) {
      expect(isInlineType(type)).toBe(false);
    }
  });
});

describe("formatting", () => {
  it("should format byte counts for people", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("should treat unknown types as documents", () => {
    expect(fileCategory("application/x-unknown")).toBe("document");
    expect(fileCategory("image/gif")).toBe("image");
  });
});
