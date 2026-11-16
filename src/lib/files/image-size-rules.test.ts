import { describe, expect, it } from "vitest";

import { imageHeaderBytes, readImageHeader } from "./image-size-rules";

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/*
 * First bytes of real pictures, as the canvas encoders of three browser
 * engines wrote them (toBlob at quality 0.9): the types a capture part has.
 */
const samples = {
  // Chromium, WebP 1440 x 840: the extended form (it carries a color profile).
  webpExtended: "524946460e0e000057454250565038580a000000200000009f05004703004943",
  // Firefox, WebP 1440 x 840: the plain lossy form.
  webpLossy: "52494646300c00005745425056503820240c0000b015019d012aa00548033e31",
  // Firefox, WebP 390 x 57.
  webpLossySmall: "52494646de0300005745425056503820d2030000f019009d012a860139003e31",
  // Firefox, JPEG 1308 x 924: JFIF, two quantization tables, then the frame header.
  jpegPlain:
    "ffd8ffe000104a46494600010100000100010000ffdb0043000302020302020303030304030304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b1016101113141515150c0f171816141812141514ffdb00430103040405040509050509140d0b0d1414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414ffc0001108039c051c03",
  // WebKit, JPEG 1308 x 924: JFIF, Exif, and a Photoshop segment come first.
  jpegWithSegments:
    "ffd8ffe000104a46494600010100004800480000ffe1004c4578696600004d4d002a00000008000187690004000000010000001a000000000003a00100030000000100010000a0020004000000010000051ca0030004000000010000039c00000000ffed003850686f746f73686f7020332e30003842494d04040000000000003842494d0425000000000010d41d8cd98f00b204e9800998ecf8427effc0001108039c051c03",
} as const;

/** A lossless WebP header for a picture of this size. */
function losslessWebp(width: number, height: number): Uint8Array {
  const bits = (width - 1) + (height - 1) * 0x4000;
  const size = [bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff];
  return Uint8Array.from([...fromHex("52494646ffffffff574542505650384c10000000"), 0x2f, ...size, 0, 0, 0]);
}

/** A JPEG whose frame header follows a color profile segment of `profileBytes` bytes, as Chromium writes one. */
function jpegAfterProfile(profileBytes: number, width: number, height: number): Uint8Array {
  const length = profileBytes + 2;
  const profile = [0xff, 0xe2, length >> 8, length & 0xff, ...Array.from({ length: profileBytes }, () => 0)];
  const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03];
  return Uint8Array.from([...fromHex("ffd8ffe000104a46494600010100000100010000"), ...profile, ...frame]);
}

describe("readImageHeader", () => {
  it("should read the size of an extended WebP when the first chunk is VP8X", () => {
    expect(readImageHeader(fromHex(samples.webpExtended))).toEqual({ type: "image/webp", width: 1440, height: 840 });
  });

  it("should read the size of a lossy WebP when the first chunk is VP8", () => {
    expect(readImageHeader(fromHex(samples.webpLossy))).toEqual({ type: "image/webp", width: 1440, height: 840 });
    expect(readImageHeader(fromHex(samples.webpLossySmall))).toEqual({ type: "image/webp", width: 390, height: 57 });
  });

  it("should read the size of a lossless WebP when the first chunk is VP8L", () => {
    expect(readImageHeader(losslessWebp(390, 57))).toEqual({ type: "image/webp", width: 390, height: 57 });
    expect(readImageHeader(losslessWebp(1308, 924))).toEqual({ type: "image/webp", width: 1308, height: 924 });
  });

  it("should read the size of a JPEG when the frame header follows the tables", () => {
    expect(readImageHeader(fromHex(samples.jpegPlain))).toEqual({ type: "image/jpeg", width: 1308, height: 924 });
  });

  it("should read the size of a JPEG when other segments come before the frame header", () => {
    expect(readImageHeader(fromHex(samples.jpegWithSegments))).toEqual({ type: "image/jpeg", width: 1308, height: 924 });
    expect(readImageHeader(jpegAfterProfile(600, 1440, 840))).toEqual({ type: "image/jpeg", width: 1440, height: 840 });
  });

  it("should refuse a JPEG when its frame header starts past the bytes that are read", () => {
    const late = jpegAfterProfile(imageHeaderBytes, 1440, 840);
    expect(readImageHeader(late.slice(0, imageHeaderBytes))).toBeNull();
  });

  it("should refuse a header when it is cut short", () => {
    expect(readImageHeader(fromHex(samples.webpExtended).slice(0, 29))).toBeNull();
    expect(readImageHeader(fromHex(samples.webpLossy).slice(0, 29))).toBeNull();
    expect(readImageHeader(losslessWebp(390, 57).slice(0, 24))).toBeNull();
    expect(readImageHeader(fromHex(samples.jpegPlain).slice(0, -3))).toBeNull();
    expect(readImageHeader(new Uint8Array())).toBeNull();
  });

  it("should refuse a file when it is another format, whatever it is called", () => {
    // A PNG, which is what a browser hands back when it cannot encode WebP.
    expect(readImageHeader(fromHex("89504e470d0a1a0a0000000d49484452000005a0000003480806000000316748"))).toBeNull();
    // A GIF, a PDF, a WAV (RIFF, but not WEBP), and HTML.
    expect(readImageHeader(fromHex("474946383961a005480300000000000000000000000000000000000000000000"))).toBeNull();
    expect(readImageHeader(new TextEncoder().encode("%PDF-1.7 this is not a picture at all"))).toBeNull();
    expect(readImageHeader(fromHex("524946462400000057415645666d7420100000000100010044ac000088580100"))).toBeNull();
    expect(readImageHeader(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
  });

  it("should refuse a WebP when its first chunk is not a picture or its start code is wrong", () => {
    const unknownChunk = fromHex(samples.webpLossy);
    unknownChunk.set(new TextEncoder().encode("ALPH"), 12);
    expect(readImageHeader(unknownChunk)).toBeNull();
    const badStartCode = fromHex(samples.webpLossy);
    badStartCode[23] = 0;
    expect(readImageHeader(badStartCode)).toBeNull();
    const badSignature = losslessWebp(390, 57);
    badSignature[20] = 0;
    expect(readImageHeader(badSignature)).toBeNull();
  });

  it("should refuse a JPEG when the scan starts before any frame header or a segment is broken", () => {
    expect(readImageHeader(fromHex("ffd8ffe000104a46494600010100000100010000ffda000c03010002110311003f00"))).toBeNull();
    expect(readImageHeader(fromHex("ffd8ffe000004a464946000101000001000100000000"))).toBeNull();
    expect(readImageHeader(fromHex("ffd8ffe000104a4649460001010000010001000000c0001108039c051c03"))).toBeNull();
  });

  it("should refuse a picture when it says its width or height is zero", () => {
    expect(readImageHeader(jpegAfterProfile(10, 0, 840))).toBeNull();
    const flat = fromHex(samples.webpLossy);
    flat[28] = 0;
    flat[29] = 0;
    expect(readImageHeader(flat)).toBeNull();
  });
});
