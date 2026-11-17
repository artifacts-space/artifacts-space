import { describe, expect, it } from "vitest";

import { matchesFileSignature } from "./signature";

const encoder = new TextEncoder();
const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === "string" ? Array.from(encoder.encode(value)) : [value])));

describe("matchesFileSignature", () => {
  it("should accept files whose first bytes match their type", () => {
    expect(matchesFileSignature("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe(true);
    expect(matchesFileSignature("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesFileSignature("application/pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(matchesFileSignature("application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes("PK", 3, 4, 20, 0))).toBe(true);
    expect(matchesFileSignature("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe(true);
    expect(matchesFileSignature("audio/wav", bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "))).toBe(true);
    expect(matchesFileSignature("video/mp4", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true);
    expect(matchesFileSignature("image/avif", bytes(0, 0, 0, 0x20, "ftypavif"))).toBe(true);
    expect(matchesFileSignature("audio/mpeg", bytes("ID3", 4, 0))).toBe(true);
    expect(matchesFileSignature("text/csv", bytes("a,b\n1,2"))).toBe(true);
  });

  it("should refuse files whose first bytes do not match their type", () => {
    expect(matchesFileSignature("image/png", bytes("MZ", 0x90, 0))).toBe(false);
    expect(matchesFileSignature("application/pdf", bytes("<html>"))).toBe(false);
    expect(matchesFileSignature("image/webp", bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe(false);
    expect(matchesFileSignature("image/avif", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(false);
    expect(matchesFileSignature("text/plain", bytes("MZ", 0, 0))).toBe(false);
    expect(matchesFileSignature("image/gif", bytes("GIF"))).toBe(false);
  });
});

describe("matchesPageFileSignature", () => {
  const ascii = (text: string) => new TextEncoder().encode(text);

  it("should accept page files whose first bytes match the type their path gave them", async () => {
    const { matchesPageFileSignature } = await import("./signature");
    expect(matchesPageFileSignature("text/css", ascii("body { margin: 0 }"))).toBe(true);
    expect(matchesPageFileSignature("text/javascript", ascii("export const a = 1;"))).toBe(true);
    expect(matchesPageFileSignature("image/svg+xml", ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBe(true);
    expect(matchesPageFileSignature("font/woff2", ascii("wOF2\u0000\u0001"))).toBe(true);
    expect(matchesPageFileSignature("font/woff", ascii("wOFF\u0000\u0001"))).toBe(true);
    expect(matchesPageFileSignature("font/ttf", new Uint8Array([0, 1, 0, 0, 0, 12]))).toBe(true);
    expect(matchesPageFileSignature("font/otf", ascii("OTTO\u0000"))).toBe(true);
    expect(matchesPageFileSignature("application/wasm", new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]))).toBe(true);
    expect(matchesPageFileSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });

  it("should refuse a page file whose first bytes are another kind of file", async () => {
    const { matchesPageFileSignature } = await import("./signature");
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    for (const type of ["text/css", "text/javascript", "image/svg+xml", "font/woff2", "font/woff", "font/ttf", "font/otf", "application/wasm", "image/png"]) {
      expect(matchesPageFileSignature(type, exe), type).toBe(false);
    }
    expect(matchesPageFileSignature("font/woff2", ascii("wOFF\u0000\u0001"))).toBe(false);
  });

  it("should refuse a type no page file is stored as", async () => {
    const { matchesPageFileSignature } = await import("./signature");
    expect(matchesPageFileSignature("text/html", ascii("<!doctype html>"))).toBe(false);
    expect(matchesPageFileSignature("application/pdf", ascii("%PDF-1.7"))).toBe(false);
  });
});
