import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hasReadableDimensions, imageDimensionBytes, jpegOrientation, keptDimensions, maxImageSide, readImageDimensions } from "./image-dimensions";

const ascii = (text: string) => Array.from(new TextEncoder().encode(text));
const be32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const be16 = (value: number) => [(value >> 8) & 255, value & 255];
const le16 = (value: number) => [value & 255, (value >> 8) & 255];

/** A PNG's signature and IHDR chunk. */
const png = (width: number, height: number) => new Uint8Array([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii("IHDR"), ...be32(width), ...be32(height), 8, 6, 0, 0, 0]);
const gif = (width: number, height: number) => new Uint8Array([...ascii("GIF89a"), ...le16(width), ...le16(height), 0, 0, 0]);

/** A JPEG up to its frame header: an optional EXIF block that states `orientation`, a quantization table, then SOF0. */
function jpeg(width: number, height: number, orientation?: number, bigEndian = true): Uint8Array {
  const u16 = (value: number) => (bigEndian ? be16(value) : le16(value));
  const u32 = (value: number) => (bigEndian ? be32(value) : be32(value).reverse());
  const tiff = [...ascii(bigEndian ? "MM" : "II"), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation ?? 1), 0, 0, ...u32(0)];
  const exif = orientation === undefined ? [] : [0xff, 0xe1, ...be16(2 + 6 + tiff.length), ...ascii("Exif"), 0, 0, ...tiff];
  const table = [0xff, 0xdb, ...be16(67), ...new Array<number>(65).fill(1)];
  const frame = [0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...exif, ...table, ...frame]);
}

/** One ISO box: its length, its type, and its payload. */
const box = (type: string, payload: number[]) => [...be32(8 + payload.length), ...ascii(type), ...payload];
const ispe = (width: number, height: number) => box("ispe", [0, 0, 0, 0, ...be32(width), ...be32(height)]);

/** An AVIF's file type box, then a property container with the boxes given. */
const avif = (...properties: number[][]) => new Uint8Array([...box("ftyp", [...ascii("avif"), 0, 0, 0, 0, ...ascii("avifmif1")]), ...box("meta", [0, 0, 0, 0, ...box("iprp", box("ipco", properties.flat()))])]);

describe("readImageDimensions", () => {
  it("should read a PNG's size from its header", () => {
    expect(readImageDimensions("image/png", png(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it("should read a GIF's size from its header", () => {
    expect(readImageDimensions("image/gif", gif(480, 270))).toEqual({ width: 480, height: 270 });
  });

  it("should read a JPEG's size from its frame header", () => {
    expect(readImageDimensions("image/jpeg", jpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 });
  });

  it.each([5, 6, 7, 8])("should swap a JPEG's sides when its camera orientation is %s, as browsers draw it", (orientation) => {
    expect(readImageDimensions("image/jpeg", jpeg(4032, 3024, orientation))).toEqual({ width: 3024, height: 4032 });
    expect(readImageDimensions("image/jpeg", jpeg(4032, 3024, orientation, false))).toEqual({ width: 3024, height: 4032 });
  });

  it.each([1, 2, 3, 4])("should keep a JPEG's sides when its camera orientation is %s", (orientation) => {
    expect(readImageDimensions("image/jpeg", jpeg(4032, 3024, orientation))).toEqual({ width: 4032, height: 3024 });
  });

  it("should take an AVIF's largest stated size, so a thumbnail or a tile is never the picture", () => {
    expect(readImageDimensions("image/avif", avif(ispe(160, 120), ispe(2880, 2160), ispe(512, 512)))).toEqual({ width: 2880, height: 2160 });
  });

  it("should swap an AVIF's sides when it is turned a quarter", () => {
    expect(readImageDimensions("image/avif", avif(ispe(2880, 2160), box("irot", [1])))).toEqual({ width: 2160, height: 2880 });
    expect(readImageDimensions("image/avif", avif(ispe(2880, 2160), box("irot", [2])))).toEqual({ width: 2880, height: 2160 });
  });

  it("should read the real files this site serves", () => {
    const start = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", name))).subarray(0, imageDimensionBytes);
    expect(readImageDimensions("image/webp", start("hero-dusk.webp"))).toEqual({ width: 2880, height: 2160 });
    expect(readImageDimensions("image/png", start("artifacts-space-icon.png"))).toEqual({ width: 1254, height: 1254 });
  });

  it.each([
    ["a PNG that states no width", "image/png", png(0, 900)],
    ["a PNG that states a width past the limit", "image/png", png(maxImageSide + 1, 900)],
    ["a PNG that states a height of four billion", "image/png", png(900, 0xffffffff)],
    ["a GIF that states no height", "image/gif", gif(480, 0)],
    ["an AVIF with a size past the limit", "image/avif", avif(ispe(70_000, 10))],
    ["an AVIF with no size box", "image/avif", avif(box("pixi", [0, 0, 0, 0, 3, 8, 8, 8]))],
    ["a header cut short", "image/png", png(1600, 900).subarray(0, 20)],
    ["bytes of another type than the one stated", "image/png", gif(480, 270)],
    ["a JPEG whose frame header is not in the bytes read", "image/jpeg", jpeg(4032, 3024).subarray(0, 40)],
    ["no bytes", "image/webp", new Uint8Array()],
  ])("should keep no size for %s", (_name, type, bytes) => {
    expect(readImageDimensions(type, bytes)).toBeNull();
  });

  it.each(["application/pdf", "image/svg+xml", "video/mp4", "text/css", "toString"])("should read nothing for the type %s", (type) => {
    expect(hasReadableDimensions(type)).toBe(false);
    expect(readImageDimensions(type, png(1600, 900))).toBeNull();
  });
});

describe("jpegOrientation", () => {
  it("should be 1 for a JPEG without an EXIF block, and for bytes that are cut", () => {
    expect(jpegOrientation(jpeg(10, 10))).toBe(1);
    expect(jpegOrientation(jpeg(10, 10, 6).subarray(0, 14))).toBe(1);
  });
});

describe("keptDimensions", () => {
  it("should keep whole sides from 1 to the limit", () => {
    expect(keptDimensions(1, maxImageSide)).toEqual({ width: 1, height: maxImageSide });
  });

  it.each([[0, 10], [10, 0], [-4, 10], [1.5, 10], [10, maxImageSide + 1], [Number.NaN, 10], [null, 10], [10, undefined], ["10", 10]])("should keep nothing for %s by %s", (width, height) => {
    expect(keptDimensions(width, height)).toBeNull();
  });
});
