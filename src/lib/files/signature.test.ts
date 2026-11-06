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
