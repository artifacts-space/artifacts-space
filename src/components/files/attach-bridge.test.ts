import { describe, expect, it } from "vitest";

import { attachFilesEvent, readAttachRequest } from "./attach-bridge";

const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
const event = (detail: unknown) => new CustomEvent(attachFilesEvent, { detail });

describe("readAttachRequest", () => {
  it("should read a request to choose files when it carries none", () => {
    expect(readAttachRequest(event({ artifactId: "a1", files: null }), "a1")).toEqual({ artifactId: "a1", files: null });
    expect(readAttachRequest(event({ artifactId: "a1" }), "a1")).toEqual({ artifactId: "a1", files: null });
  });

  it("should read dropped files, keeping only real files", () => {
    expect(readAttachRequest(event({ artifactId: "a1", files: [file, "b.png", null] }), "a1")).toEqual({ artifactId: "a1", files: [file] });
  });

  it("should not take a request for another artifact", () => {
    expect(readAttachRequest(event({ artifactId: "a2", files: [file] }), "a1")).toBeNull();
  });

  it("should refuse a detail that is not a request", () => {
    expect(readAttachRequest(event({ artifactId: "a1", files: "notes.pdf" }), "a1")).toBeNull();
    expect(readAttachRequest(event({ artifactId: "a1", files: [] }), "a1")).toBeNull();
    expect(readAttachRequest(event(null), "a1")).toBeNull();
    expect(readAttachRequest(new Event(attachFilesEvent), "a1")).toBeNull();
  });
});
