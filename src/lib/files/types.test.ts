import { describe, expect, it } from "vitest";

import { fileUrl, oldCopyUrl } from "./types";

describe("fileUrl", () => {
  it("should give a file that was never replaced its plain URL", () => {
    expect(fileUrl("f1")).toBe("/api/files/f1");
    expect(fileUrl("f1", { download: true, replacedAt: null })).toBe("/api/files/f1?download=1");
  });

  it("should give a replaced file a new URL, so a cached redirect never opens the old content", () => {
    const at = "2026-11-10T12:00:00.000Z";
    expect(fileUrl("f1", { replacedAt: at })).toBe(`/api/files/f1?v=${String(Date.parse(at))}`);
    expect(fileUrl("f1", { download: true, replacedAt: at })).toBe(`/api/files/f1?download=1&v=${String(Date.parse(at))}`);
  });
});

describe("oldCopyUrl", () => {
  it("should point at the editors-only copy route of the file", () => {
    expect(oldCopyUrl({ fileId: "f1", copyId: "c1" }, { download: true })).toBe("/api/files/f1/copies/c1?download=1");
  });
});
