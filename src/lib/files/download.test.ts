import { describe, expect, it } from "vitest";

import { forReaders, servedVersionTime } from "./download";

const savedAt = new Date("2026-11-05T12:00:00Z");
const view = { title: "t", icon: null, theme: null, cover: null, summary: "", content: "", kind: "file" as const, language: "", project: "", source: "", metadata: {}, updatedAt: savedAt, editedBy: null, harness: null };

describe("servedVersionTime", () => {
  it("should give the approved version's time when the viewer reads that version", () => {
    expect(servedVersionTime({ version: { source: "approved", versionId: "v1" }, served: view })).toEqual(savedAt);
  });

  it("should give null when the viewer reads the latest version", () => {
    expect(servedVersionTime({ version: { source: "latest", versionId: null }, served: view })).toBeNull();
  });
});

describe("forReaders", () => {
  const file = { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", filename: "plan.png", contentType: "image/png", size: 10, createdAt: "2026-11-17T00:00:00.000Z", replacedAt: null };

  it("should keep an image's pixel size, so the read view holds its place before it loads", () => {
    expect(forReaders({ ...file, width: 1600, height: 900 })).toEqual({ ...file, width: 1600, height: 900 });
  });

  it("should drop the editing flags and nothing else", () => {
    expect(forReaders({ ...file, width: 1600, height: 900, embedded: true, pictured: true, pagePath: "img/plan.png" })).toEqual({ ...file, width: 1600, height: 900, pagePath: "img/plan.png" });
  });

  it("should give no size for a file that has none, or one out of range", () => {
    expect(forReaders(file)).toEqual(file);
    expect(forReaders({ ...file, width: 70_000, height: 900 })).toEqual(file);
  });
});
