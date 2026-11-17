import { describe, expect, it } from "vitest";

import { addMediaEvent, dropZoneAttribute, dropZoneProps, readMediaRequest, zoneTakenByPage } from "./media-bridge";

const attached = { id: "11111111-1111-4111-8111-111111111111", filename: "IMG_6266.png", contentType: "image/png" };

describe("dropZoneProps", () => {
  it("should mark a zone the document takes files in when the page does not take them", () => {
    expect(dropZoneProps()).toEqual({ [dropZoneAttribute]: "" });
    expect(dropZoneProps(false)).toEqual({ [dropZoneAttribute]: "" });
  });

  it("should say the page takes files when it does", () => {
    expect(dropZoneProps(true)).toEqual({ [dropZoneAttribute]: zoneTakenByPage });
  });
});

describe("readMediaRequest", () => {
  const event = (detail: unknown) => new CustomEvent(addMediaEvent, { detail });

  it("should read the files the artifact already has, in order, when the request names them", () => {
    const second = { ...attached, id: "22222222-2222-4222-8222-222222222222", filename: "notes.pdf", contentType: "application/pdf" };
    expect(readMediaRequest(event({ attached: [attached, second] }))).toEqual({ attached: [attached, second] });
    expect(readMediaRequest(event({ attached: [attached, { id: 4 }] }))).toEqual({ attached: [attached] });
  });

  it("should read dropped files with their point when the request carries them", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(readMediaRequest(event({ files: [file], point: { x: 4, y: 9 } }))).toEqual({ files: [file], point: { x: 4, y: 9 } });
    expect(readMediaRequest(event({ files: [file] }))).toEqual({ files: [file], point: undefined });
  });

  it("should keep only real files and points when the detail holds anything else", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(readMediaRequest(event({ files: [file, "b.png", null], point: { x: "4" } }))).toEqual({ files: [file], point: undefined });
  });

  it("should refuse a detail that is not a request", () => {
    expect(readMediaRequest(event({ attached: [{ id: 4 }] }))).toBeNull();
    expect(readMediaRequest(event({ attached: [] }))).toBeNull();
    expect(readMediaRequest(event({ attached }))).toBeNull();
    expect(readMediaRequest(event({ files: "a.png" }))).toBeNull();
    expect(readMediaRequest(event(null))).toBeNull();
    expect(readMediaRequest(new Event(addMediaEvent))).toBeNull();
  });
});
