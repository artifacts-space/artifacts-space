import { describe, expect, it } from "vitest";

import { canReadFile, canUseFileInArtifact, type FileAccessSubject } from "./access-rules";

const attached: FileAccessSubject = { status: "ready", uploaderId: "author", artifactId: "art", attachedAt: new Date("2026-11-05T10:00:00Z") };
const unattached: FileAccessSubject = { status: "ready", uploaderId: "author", artifactId: null, attachedAt: null };
const viewable = { viewable: true, servedVersionAt: null, hiddenImage: false };

describe("canReadFile", () => {
  it("should allow anyone who can view the artifact when the file is attached", () => {
    expect(canReadFile(attached, null, viewable)).toBe(true);
    expect(canReadFile(attached, "reader", viewable)).toBe(true);
  });

  it("should refuse when the artifact is not viewable or missing", () => {
    expect(canReadFile(attached, "author", { viewable: false, servedVersionAt: null, hiddenImage: false })).toBe(false);
    expect(canReadFile(attached, "author", null)).toBe(false);
  });

  it("should refuse files that are still uploading, even for the uploader", () => {
    expect(canReadFile({ ...unattached, status: "pending" }, "author", null)).toBe(false);
    expect(canReadFile({ ...attached, status: "pending" }, "author", viewable)).toBe(false);
  });

  it("should allow only the uploader when the file is not attached yet", () => {
    expect(canReadFile(unattached, "author", null)).toBe(true);
    expect(canReadFile(unattached, "someone", null)).toBe(false);
    expect(canReadFile(unattached, null, null)).toBe(false);
    expect(canReadFile({ ...unattached, uploaderId: null }, null, null)).toBe(false);
  });

  it("should hide files attached after the approved version when the viewer reads that version", () => {
    const servedVersionAt = new Date("2026-11-05T11:00:00Z");
    expect(canReadFile(attached, null, { viewable: true, servedVersionAt, hiddenImage: false })).toBe(true);
    expect(canReadFile({ ...attached, attachedAt: new Date("2026-11-05T12:00:00Z") }, null, { viewable: true, servedVersionAt, hiddenImage: false })).toBe(false);
    expect(canReadFile({ ...attached, attachedAt: null }, null, { viewable: true, servedVersionAt, hiddenImage: false })).toBe(false);
  });

  it("should refuse an old icon or cover image the approved version does not show when the viewer reads that version", () => {
    const servedVersionAt = new Date("2026-11-05T11:00:00Z");
    expect(canReadFile(attached, null, { viewable: true, servedVersionAt, hiddenImage: true })).toBe(false);
    expect(canReadFile(attached, "reader", { viewable: true, servedVersionAt, hiddenImage: true })).toBe(false);
  });

  it("should allow the team a kept image when they read the latest version", () => {
    expect(canReadFile(attached, "member", { viewable: true, servedVersionAt: null, hiddenImage: true })).toBe(true);
  });
});

describe("canUseFileInArtifact", () => {
  it("should allow the author's own unattached upload", () => {
    expect(canUseFileInArtifact(unattached, "author", null)).toBe(true);
    expect(canUseFileInArtifact(unattached, "author", "art")).toBe(true);
  });

  it("should allow a file already in this artifact", () => {
    expect(canUseFileInArtifact(attached, "new-owner", "art")).toBe(true);
  });

  it("should refuse someone else's upload, another artifact's file, and pending uploads", () => {
    expect(canUseFileInArtifact(unattached, "other", null)).toBe(false);
    expect(canUseFileInArtifact(attached, "author", "other-art")).toBe(false);
    expect(canUseFileInArtifact(attached, "author", null)).toBe(false);
    expect(canUseFileInArtifact({ ...unattached, status: "pending" }, "author", null)).toBe(false);
  });
});
