import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { emojiImage, emojiKey, ogIconFor } from "./icon";

describe("emojiKey", () => {
  it("should join code points and drop the emoji selector", () => {
    expect(emojiKey("🚀")).toBe("1f680");
    expect(emojiKey("❤️")).toBe("2764");
    expect(emojiKey("👍🏽")).toBe("1f44d-1f3fd");
    expect(emojiKey("🧑‍🎨")).toBe("1f9d1-200d-1f3a8");
  });
});

describe("emojiImage", () => {
  it("should draw from the vendored set when the emoji is in it", () => {
    for (const emoji of ["🚀", "❤️", "👍🏽", "🧑‍🎨", "🧪"]) expect(emojiImage(emoji)).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("should give null when the set has no artwork, such as a flag", () => {
    expect(emojiImage("🇺🇸")).toBeNull();
  });
});

describe("ogIconFor", () => {
  it("should draw a Tabler icon and an emoji when the approved version has one", () => {
    expect(ogIconFor("tabler:rocket")).toEqual({ type: "tabler", name: "rocket" });
    expect(ogIconFor("🚀")?.type).toBe("image");
  });

  it("should keep the card as it was when there is no icon, an image icon, or no artwork", () => {
    expect(ogIconFor(null)).toBeNull();
    expect(ogIconFor("file:0f8fad5b-d9cb-469f-a165-70867728950e")).toBeNull();
    expect(ogIconFor("🇺🇸")).toBeNull();
  });

  it("should never fetch artwork at render when the module draws an emoji", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/og/icon.tsx"), "utf8");
    expect(source).not.toMatch(/fetch\(|https?:\/\/(?!www\.w3\.org)/);
  });
});
