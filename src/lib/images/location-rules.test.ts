import { describe, expect, it } from "vitest";

import { jpegBytes, jpegSegment, pngBytes, pngChunk, pngExif, pngText, tiffBlock, webpBytes, webpChunk } from "./image-bytes-harness";
import { exifFinding, findLocation } from "./location-rules";

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

describe("findLocation for a JPEG", () => {
  it("should find no location when its Exif has no GPS pointer, in either byte order", () => {
    expect(findLocation("image/jpeg", jpegBytes())).toBe("none");
    expect(findLocation("image/jpeg", jpegBytes({ exif: { orientation: 6 } }))).toBe("none");
    expect(findLocation("image/jpeg", jpegBytes({ exif: { orientation: 6, little: true } }))).toBe("none");
  });

  it("should find a location when its Exif has the GPS pointer, in either byte order", () => {
    expect(findLocation("image/jpeg", jpegBytes({ exif: { gps: true } }))).toBe("location");
    expect(findLocation("image/jpeg", jpegBytes({ exif: { gps: true, little: true, orientation: 3 } }))).toBe("location");
  });

  it("should find a location when its XMP mentions GPS or a place, and none when it does not", () => {
    expect(findLocation("image/jpeg", jpegBytes({ xmp: '<x:xmpmeta><rdf:Description exif:GPSLatitude="51,30N"/></x:xmpmeta>' }))).toBe("location");
    expect(findLocation("image/jpeg", jpegBytes({ xmp: "<photoshop:City>Lyon</photoshop:City>" }))).toBe("location");
    expect(findLocation("image/jpeg", jpegBytes({ xmp: '<rdf:Description xmp:CreatorTool="Editor"/>' }))).toBe("none");
  });

  it("should not tell when it has a segment the check does not read", () => {
    expect(findLocation("image/jpeg", jpegBytes({ segments: [jpegSegment(0xed, ascii("Photoshop 3.0\0"))] }))).toBe("unknown");
    expect(findLocation("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe2, ascii("MPF\0"))] }))).toBe("unknown");
    expect(findLocation("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe1, ascii("Something else"))] }))).toBe("unknown");
  });

  it("should take a color profile and a comment without a place", () => {
    expect(findLocation("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe2, ascii("ICC_PROFILE\0\x01\x01")), jpegSegment(0xfe, ascii("Made here"))] }))).toBe("none");
  });

  it("should not tell when bytes follow the end of the picture, as a joined video or second picture", () => {
    expect(findLocation("image/jpeg", jpegBytes({ trailing: [0, 0, 0, 0x18, ...ascii("ftypmp42")] }))).toBe("unknown");
    expect(findLocation("image/jpeg", jpegBytes({ trailing: [...jpegBytes({ exif: { gps: true } })] }))).toBe("unknown");
  });

  it("should not tell when the file is cut short anywhere", () => {
    const whole = jpegBytes({ exif: { orientation: 1 } });
    for (let length = 0; length < whole.length; length += 1) {
      expect(findLocation("image/jpeg", whole.subarray(0, length)), `cut at ${String(length)}`).not.toBe("none");
    }
  });

  it("should not tell when a segment states a length past the end of the file", () => {
    const huge = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, ...ascii("Exif\0\0"), ...tiffBlock()]);
    expect(findLocation("image/jpeg", huge)).toBe("unknown");
  });

  it("should not tell when a segment states a length under two", () => {
    expect(findLocation("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]))).toBe("unknown");
  });
});

describe("findLocation for a PNG", () => {
  it("should find no location in a plain screenshot, macOS's iDOT chunk included", () => {
    expect(findLocation("image/png", pngBytes())).toBe("none");
    expect(findLocation("image/png", pngBytes({ chunks: [pngChunk("sRGB", [0]), pngChunk("pHYs", new Array<number>(9).fill(0)), pngChunk("iDOT", new Array<number>(28).fill(0))] }))).toBe("none");
  });

  it("should read its eXIf chunk for the GPS pointer", () => {
    expect(findLocation("image/png", pngBytes({ chunks: [pngExif({ orientation: 1 })] }))).toBe("none");
    expect(findLocation("image/png", pngBytes({ chunks: [pngExif({ gps: true })] }))).toBe("location");
    expect(findLocation("image/png", pngBytes({ chunks: [pngExif({ gps: true, little: true })] }))).toBe("location");
  });

  it("should read XMP in an iTXt chunk, and not tell when it is compressed", () => {
    expect(findLocation("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "<exif:UserComment>Screenshot</exif:UserComment>")] }))).toBe("none");
    expect(findLocation("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "<exif:GPSLongitude>2,20E</exif:GPSLongitude>")] }))).toBe("location");
    expect(findLocation("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "x", true)] }))).toBe("unknown");
  });

  it("should not tell for compressed text, a raw camera profile, or a chunk it does not know", () => {
    expect(findLocation("image/png", pngBytes({ chunks: [pngChunk("zTXt", [...ascii("Comment\0"), 0, 1, 2])] }))).toBe("unknown");
    expect(findLocation("image/png", pngBytes({ chunks: [pngChunk("tEXt", [...ascii("Raw profile type exif\0"), ...ascii("45786966")])] }))).toBe("unknown");
    expect(findLocation("image/png", pngBytes({ chunks: [pngChunk("prVt", [1])] }))).toBe("unknown");
  });

  it("should not tell when bytes follow IEND or the file is cut short", () => {
    expect(findLocation("image/png", pngBytes({ trailing: [1, 2, 3] }))).toBe("unknown");
    const whole = pngBytes({ chunks: [pngExif({})] });
    for (let length = 0; length < whole.length; length += 1) {
      expect(findLocation("image/png", whole.subarray(0, length)), `cut at ${String(length)}`).not.toBe("none");
    }
  });

  it("should not tell when a chunk states a huge length", () => {
    const bytes = pngBytes();
    const huge = new Uint8Array([...bytes.subarray(0, 8), 0xff, 0xff, 0xff, 0xff, ...ascii("tEXt"), ...bytes.subarray(16)]);
    expect(findLocation("image/png", huge)).toBe("unknown");
  });
});

describe("findLocation for a WebP", () => {
  it("should find no location in a WebP without EXIF, and read its EXIF chunk", () => {
    expect(findLocation("image/webp", webpBytes())).toBe("none");
    expect(findLocation("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ orientation: 1 }))] }))).toBe("none");
    expect(findLocation("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ gps: true }))] }))).toBe("location");
    expect(findLocation("image/webp", webpBytes({ chunks: [webpChunk("EXIF", [...ascii("Exif\0\0"), ...tiffBlock({ gps: true, little: true })])] }))).toBe("location");
  });

  it("should read its XMP chunk", () => {
    expect(findLocation("image/webp", webpBytes({ chunks: [webpChunk("XMP ", ascii("<exif:GPSAltitude>12</exif:GPSAltitude>"))] }))).toBe("location");
  });

  it("should not tell for an unknown chunk, a size that disagrees with the file, or a file cut short", () => {
    expect(findLocation("image/webp", webpBytes({ chunks: [webpChunk("abcd", [1, 2])] }))).toBe("unknown");
    expect(findLocation("image/webp", webpBytes({ riffExtra: 4 }))).toBe("unknown");
    expect(findLocation("image/webp", new Uint8Array([...webpBytes(), 0, 0]))).toBe("unknown");
    const whole = webpBytes();
    expect(findLocation("image/webp", whole.subarray(0, whole.length - 3))).toBe("unknown");
  });
});

describe("findLocation for other files", () => {
  it("should not tell for a type it cannot check, or for bytes that are not the type they claim", () => {
    expect(findLocation("image/avif", new Uint8Array([0, 0, 0, 0x1c, ...ascii("ftypavif")]))).toBe("unknown");
    expect(findLocation("image/heic", new Uint8Array(16))).toBe("unknown");
    expect(findLocation("image/png", jpegBytes())).toBe("unknown");
    expect(findLocation("image/jpeg", pngBytes())).toBe("unknown");
    expect(findLocation("image/webp", new Uint8Array())).toBe("unknown");
  });

  it("should never throw, whatever the bytes", () => {
    let seed = 11;
    for (let round = 0; round < 300; round += 1) {
      const bytes = new Uint8Array(64).map(() => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % 256;
      });
      bytes.set([0xff, 0xd8], 0);
      expect(() => findLocation("image/jpeg", bytes)).not.toThrow();
      expect(() => findLocation("image/png", bytes)).not.toThrow();
      expect(() => findLocation("image/webp", bytes)).not.toThrow();
    }
  });
});

describe("exifFinding", () => {
  it("should not tell when the directory states more entries than the block holds", () => {
    const block = tiffBlock();
    block[9] = 0xff;
    expect(exifFinding(new Uint8Array(block), 0, block.length)).toBe("unknown");
  });

  it("should not tell when the first directory is past the block", () => {
    const block = [...ascii("MM"), 0, 42, 0x7f, 0xff, 0xff, 0xff];
    expect(exifFinding(new Uint8Array(block), 0, block.length)).toBe("unknown");
  });
});
