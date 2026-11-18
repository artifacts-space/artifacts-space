import { describe, expect, it } from "vitest";

import { readImageDimensions } from "@/lib/files/image-dimensions";

import { jpegBytes } from "./image-bytes-harness";
import { keepsOriginal, mayKeepOriginal, type StillImageFacts } from "./original-rules";
import { documentPrepareProfile } from "./prepare-rules";

const profile = documentPrepareProfile;
const small: StillImageFacts = { type: "image/png", size: 40_000, privateData: "none", drawn: { width: 1280, height: 800 }, stated: { width: 1280, height: 800 } };
const facts = (change: Partial<StillImageFacts>): StillImageFacts => ({ ...small, ...change });

describe("keepsOriginal", () => {
  it("should keep a small image's own bytes when it positively has no private data", () => {
    expect(keepsOriginal(small, profile)).toBe(true);
    expect(keepsOriginal(facts({ drawn: { width: 2400, height: 2400 }, stated: { width: 2400, height: 2400 } }), profile)).toBe(true);
  });

  it("should redraw a small image that has private data (a place, a person, a device serial, a preview), or when that cannot be told", () => {
    expect(keepsOriginal(facts({ privateData: "private" }), profile)).toBe(false);
    expect(keepsOriginal(facts({ privateData: "unknown" }), profile)).toBe(false);
  });

  it("should redraw an image whose longest side, as the browser draws it, is over 2400 px", () => {
    expect(keepsOriginal(facts({ drawn: { width: 2401, height: 1000 }, stated: { width: 2401, height: 1000 } }), profile)).toBe(false);
    expect(keepsOriginal(facts({ drawn: { width: 1000, height: 4032 }, stated: { width: 1000, height: 4032 } }), profile)).toBe(false);
  });

  it("should redraw an image the browser could not decode, or whose header the server cannot read", () => {
    expect(keepsOriginal(facts({ drawn: null }), profile)).toBe(false);
    expect(keepsOriginal(facts({ stated: null }), profile)).toBe(false);
  });

  it("should redraw an image whose header states a size other than the one the browser draws, so the stored size is never wrong", () => {
    expect(keepsOriginal(facts({ drawn: { width: 800, height: 1280 } }), profile)).toBe(false);
    expect(keepsOriginal(facts({ stated: { width: 640, height: 400 } }), profile)).toBe(false);
  });

  it("should keep a small JPEG turned by its camera orientation, and store it the right way round", () => {
    const bytes = jpegBytes({ width: 640, height: 480, exif: { orientation: 6 } });
    const stated = readImageDimensions("image/jpeg", bytes);
    // The browser draws it upright: 480 wide, 640 tall. The server stores the same.
    expect(stated).toEqual({ width: 480, height: 640 });
    expect(keepsOriginal(facts({ type: "image/jpeg", drawn: { width: 480, height: 640 }, stated }), profile)).toBe(true);
    // A browser that drew it sideways would disagree with what is stored: redraw it.
    expect(keepsOriginal(facts({ type: "image/jpeg", drawn: { width: 640, height: 480 }, stated }), profile)).toBe(false);
  });

  it("should redraw a small image too big to send as it is", () => {
    expect(keepsOriginal(facts({ size: profile.maxBytes + 1 }), profile)).toBe(false);
    expect(keepsOriginal(facts({ size: 0 }), profile)).toBe(false);
  });

  it("should redraw every type the private data check cannot read", () => {
    for (const type of ["image/avif", "image/heic", "image/gif", "image/bmp", ""]) expect(keepsOriginal(facts({ type }), profile), type).toBe(false);
  });
});

describe("mayKeepOriginal", () => {
  it("should allow only JPEG, PNG, and WebP within the document image cap", () => {
    expect(mayKeepOriginal({ type: "image/webp", size: 1 }, profile)).toBe(true);
    expect(mayKeepOriginal({ type: "image/jpeg", size: profile.maxBytes }, profile)).toBe(true);
    expect(mayKeepOriginal({ type: "image/jpeg", size: profile.maxBytes + 1 }, profile)).toBe(false);
    expect(mayKeepOriginal({ type: "image/avif", size: 1 }, profile)).toBe(false);
  });
});
