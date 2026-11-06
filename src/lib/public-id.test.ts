import { describe, expect, it } from "vitest";

import { BASE58_ALPHABET, generatePublicId, isPublicId, PUBLIC_ID_LENGTH } from "./public-id";

describe("generatePublicId", () => {
  it("should return 22 base58 characters", () => {
    const id = generatePublicId();
    expect(id).toHaveLength(PUBLIC_ID_LENGTH);
    expect(isPublicId(id)).toBe(true);
  });

  it("should not repeat across many ids", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generatePublicId()));
    expect(ids.size).toBe(2000);
  });

  it("should skip bytes at or above 232 so no character is favored", () => {
    // 232..255 are rejected, so only the 0 and 57 bytes become characters.
    const bytes = new Uint8Array(32).map((_, index) => (index % 2 === 0 ? 240 : index % 4 === 1 ? 0 : 57));
    const id = generatePublicId(() => bytes);
    expect(id).toMatch(/^[1z]{22}$/);
  });

  it("should map byte values onto the alphabet by remainder", () => {
    const bytes = new Uint8Array(32).fill(58 + 9);
    expect(generatePublicId(() => bytes)).toBe(BASE58_ALPHABET.charAt(9).repeat(22));
  });

  it("should use every character of the alphabet over many ids", () => {
    const seen = new Set(Array.from({ length: 300 }, () => generatePublicId()).join(""));
    expect(seen.size).toBe(58);
  });
});

describe("isPublicId", () => {
  it("should reject ambiguous characters and wrong lengths", () => {
    expect(isPublicId("0".repeat(22))).toBe(false);
    expect(isPublicId("O".repeat(22))).toBe(false);
    expect(isPublicId("l".repeat(22))).toBe(false);
    expect(isPublicId("a".repeat(21))).toBe(false);
    expect(isPublicId("a".repeat(23))).toBe(false);
    expect(isPublicId("a".repeat(22))).toBe(true);
  });

  it("should reject a uuid", () => {
    expect(isPublicId("2f1c7a9e-3b8d-4c1e-9f2a-6d5e4c3b2a10")).toBe(false);
  });
});
