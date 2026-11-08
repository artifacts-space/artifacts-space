import { describe, expect, it } from "vitest";

import { servedVersionTime } from "./download";

const savedAt = new Date("2026-11-05T12:00:00Z");
const view = { title: "t", icon: null, theme: null, cover: null, summary: "", content: "", kind: "file" as const, language: "", project: "", source: "", metadata: {}, updatedAt: savedAt, editedBy: null };

describe("servedVersionTime", () => {
  it("should give the approved version's time when the viewer reads that version", () => {
    expect(servedVersionTime({ version: { source: "approved", versionId: "v1" }, served: view })).toEqual(savedAt);
  });

  it("should give null when the viewer reads the latest version", () => {
    expect(servedVersionTime({ version: { source: "latest", versionId: null }, served: view })).toBeNull();
  });
});
