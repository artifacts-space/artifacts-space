import { describe, expect, it } from "vitest";

import { exifTag, jpegBytes, jpegSegment, pngBytes, pngChunk, pngExif, pngText, tiffBlock, webpBytes, webpChunk } from "./image-bytes-harness";
import { exifFinding, findPrivateData } from "./private-data-rules";

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

describe("findPrivateData for a JPEG", () => {
  it("should find nothing private when its Exif has no GPS pointer, in either byte order", () => {
    expect(findPrivateData("image/jpeg", jpegBytes())).toBe("none");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { orientation: 6 } }))).toBe("none");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { orientation: 6, little: true } }))).toBe("none");
  });

  it("should find private data when its Exif has the GPS pointer, in either byte order", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { gps: true } }))).toBe("private");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { gps: true, little: true, orientation: 3 } }))).toBe("private");
  });

  it("should find private data when its XMP mentions GPS or a place, and none when it does not", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ xmp: '<x:xmpmeta><rdf:Description exif:GPSLatitude="51,30N"/></x:xmpmeta>' }))).toBe("private");
    expect(findPrivateData("image/jpeg", jpegBytes({ xmp: "<photoshop:City>Lyon</photoshop:City>" }))).toBe("private");
    expect(findPrivateData("image/jpeg", jpegBytes({ xmp: '<rdf:Description xmp:CreatorTool="Editor"/>' }))).toBe("none");
  });

  it("should not tell when it has a segment the check does not read", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ segments: [jpegSegment(0xed, ascii("Photoshop 3.0\0"))] }))).toBe("unknown");
    expect(findPrivateData("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe2, ascii("MPF\0"))] }))).toBe("unknown");
    expect(findPrivateData("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe1, ascii("Something else"))] }))).toBe("unknown");
  });

  it("should take a color profile and a comment without a place", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe2, ascii("ICC_PROFILE\0\x01\x01")), jpegSegment(0xfe, ascii("Made here"))] }))).toBe("none");
  });

  it("should not tell when bytes follow the end of the picture, as a joined video or second picture", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ trailing: [0, 0, 0, 0x18, ...ascii("ftypmp42")] }))).toBe("unknown");
    expect(findPrivateData("image/jpeg", jpegBytes({ trailing: [...jpegBytes({ exif: { gps: true } })] }))).toBe("unknown");
  });

  it("should not tell when the file is cut short anywhere", () => {
    const whole = jpegBytes({ exif: { orientation: 1 } });
    for (let length = 0; length < whole.length; length += 1) {
      expect(findPrivateData("image/jpeg", whole.subarray(0, length)), `cut at ${String(length)}`).not.toBe("none");
    }
  });

  it("should not tell when a segment states a length past the end of the file", () => {
    const huge = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, ...ascii("Exif\0\0"), ...tiffBlock()]);
    expect(findPrivateData("image/jpeg", huge)).toBe("unknown");
  });

  it("should not tell when a segment states a length under two", () => {
    expect(findPrivateData("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]))).toBe("unknown");
  });
});

describe("findPrivateData for a JPEG's preview, people, and devices", () => {
  it("should find private data when an Exif thumbnail follows the first directory, in either byte order", () => {
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { thumbnail: true } }))).toBe("private");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { thumbnail: true, little: true } }))).toBe("private");
  });

  it("should find private data when Exif names the artist, the copyright, or the author", () => {
    for (const tag of [exifTag.artist, exifTag.copyright, exifTag.xpAuthor]) {
      expect(findPrivateData("image/jpeg", jpegBytes({ exif: { first: [tag] } })), tag.toString(16)).toBe("private");
    }
  });

  it("should find private data when the Exif directory holds an owner, a serial number, a unique id, or a maker's note", () => {
    for (const tag of [exifTag.ownerName, exifTag.bodySerial, exifTag.lensSerial, exifTag.imageUniqueId, exifTag.makerNote]) {
      expect(findPrivateData("image/jpeg", jpegBytes({ exif: { exif: [exifTag.exposureTime, tag] } })), tag.toString(16)).toBe("private");
      expect(findPrivateData("image/jpeg", jpegBytes({ exif: { exif: [tag], little: true } })), tag.toString(16)).toBe("private");
    }
  });

  it("should keep a phone photo's make, model, time, settings, software, and comment", () => {
    const exif = { orientation: 6, first: [exifTag.make, exifTag.software, exifTag.dateTime], exif: [exifTag.exposureTime, exifTag.userComment, exifTag.pixelWidth, exifTag.pixelHeight] };
    expect(findPrivateData("image/jpeg", jpegBytes({ exif }))).toBe("none");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif: { ...exif, little: true } }))).toBe("none");
  });

  it("should find private data in XMP that names a creator, rights, an owner, a serial, or a thumbnail, but keep the creator tool", () => {
    for (const xmp of ["<dc:creator>Jane</dc:creator>", "<dc:rights>All</dc:rights>", "<aux:SerialNumber>42</aux:SerialNumber>", "<xmp:Thumbnails><xmpGImg:image>…</xmpGImg:image></xmp:Thumbnails>", "<xapGImg:image/>", "<photoshop:AuthorsPosition/>"]) {
      expect(findPrivateData("image/jpeg", jpegBytes({ xmp })), xmp).toBe("private");
    }
    expect(findPrivateData("image/jpeg", jpegBytes({ xmp: '<rdf:Description xmp:CreatorTool="Editor 2.1"/>' }))).toBe("none");
  });

  it("should find private data in a JFIF thumbnail or a JFXX extension", () => {
    const withThumbnail = [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0];
    expect(findPrivateData("image/jpeg", new Uint8Array([0xff, 0xd8, ...jpegSegment(0xe0, withThumbnail), ...jpegBytes().subarray(20)]))).toBe("private");
    expect(findPrivateData("image/jpeg", jpegBytes({ segments: [jpegSegment(0xe0, [...ascii("JFXX\0"), 0x10])] }))).toBe("private");
  });

  it("should not tell when the Exif directory pointer leads past the block", () => {
    const block = tiffBlock({ exif: [exifTag.userComment] });
    const pointer = block.length - (2 + 12 + 4) - 4 - 4;
    block.splice(pointer, 4, 0x7f, 0, 0, 0);
    expect(exifFinding(new Uint8Array(block), 0, block.length)).toBe("unknown");
  });
});

describe("findPrivateData for a PNG", () => {
  it("should find nothing private in a plain screenshot, macOS's iDOT chunk included", () => {
    expect(findPrivateData("image/png", pngBytes())).toBe("none");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("sRGB", [0]), pngChunk("pHYs", new Array<number>(9).fill(0)), pngChunk("iDOT", new Array<number>(28).fill(0))] }))).toBe("none");
  });

  it("should read its eXIf chunk for the GPS pointer", () => {
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif({ orientation: 1 })] }))).toBe("none");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif({ gps: true })] }))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif({ gps: true, little: true })] }))).toBe("private");
  });

  it("should read XMP in an iTXt chunk, and not tell when it is compressed", () => {
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "<exif:UserComment>Screenshot</exif:UserComment>")] }))).toBe("none");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "<exif:GPSLongitude>2,20E</exif:GPSLongitude>")] }))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngText("XML:com.adobe.xmp", "x", true)] }))).toBe("unknown");
  });

  it("should not tell for compressed text, a raw camera profile, or a chunk it does not know", () => {
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("zTXt", [...ascii("Comment\0"), 0, 1, 2])] }))).toBe("unknown");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("tEXt", [...ascii("Raw profile type exif\0"), ...ascii("45786966")])] }))).toBe("unknown");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("prVt", [1])] }))).toBe("unknown");
  });

  it("should not tell when bytes follow IEND or the file is cut short", () => {
    expect(findPrivateData("image/png", pngBytes({ trailing: [1, 2, 3] }))).toBe("unknown");
    const whole = pngBytes({ chunks: [pngExif({})] });
    for (let length = 0; length < whole.length; length += 1) {
      expect(findPrivateData("image/png", whole.subarray(0, length)), `cut at ${String(length)}`).not.toBe("none");
    }
  });

  it("should not tell when a chunk states a huge length", () => {
    const bytes = pngBytes();
    const huge = new Uint8Array([...bytes.subarray(0, 8), 0xff, 0xff, 0xff, 0xff, ...ascii("tEXt"), ...bytes.subarray(16)]);
    expect(findPrivateData("image/png", huge)).toBe("unknown");
  });
});

describe("findPrivateData for screenshots", () => {
  /** What a macOS screenshot carries: a color profile, an eXIf block with its orientation, size, and the "Screenshot" comment, its density, XMP saying the same, and iDOT. */
  const macScreenshot = (xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:PixelYDimension>1964</exif:PixelYDimension><exif:PixelXDimension>3024</exif:PixelXDimension><exif:UserComment>Screenshot</exif:UserComment></rdf:Description></rdf:RDF></x:xmpmeta>') => pngBytes({
    width: 3024,
    height: 1964,
    chunks: [
      pngChunk("iCCP", [...ascii("Display P3\0"), 0, 0x78, 0x9c, 1, 2, 3]),
      pngExif({ orientation: 1, exif: [exifTag.userComment, exifTag.pixelWidth, exifTag.pixelHeight] }),
      pngChunk("pHYs", [0, 0, 0x16, 0x25, 0, 0, 0x16, 0x25, 1]),
      pngText("XML:com.adobe.xmp", xmp),
      pngChunk("iDOT", new Array<number>(28).fill(0)),
    ],
  });

  it("should keep a macOS screenshot as it is", () => {
    expect(findPrivateData("image/png", macScreenshot())).toBe("none");
  });

  it("should keep a phone screenshot's make, model, software, time, and comment", () => {
    const exif = { orientation: 1, first: [exifTag.make, exifTag.software, exifTag.dateTime], exif: [exifTag.userComment, exifTag.pixelWidth, exifTag.pixelHeight] };
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif(exif)] }))).toBe("none");
    expect(findPrivateData("image/jpeg", jpegBytes({ exif }))).toBe("none");
  });

  it("should find private data in a screenshot whose XMP or Exif names its author", () => {
    expect(findPrivateData("image/png", macScreenshot("<dc:creator>Jane</dc:creator>"))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif({ first: [exifTag.artist] })] }))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngExif({ thumbnail: true })] }))).toBe("private");
  });

  it("should find private data in a PNG text chunk named Author or Copyright, and keep one named Software or Comment", () => {
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("tEXt", [...ascii("Author\0"), ...ascii("Jane")])] }))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("tEXt", [...ascii("Copyright\0"), ...ascii("2026")])] }))).toBe("private");
    expect(findPrivateData("image/png", pngBytes({ chunks: [pngChunk("tEXt", [...ascii("Software\0"), ...ascii("Editor")]), pngChunk("tEXt", [...ascii("Comment\0"), ...ascii("Draft")])] }))).toBe("none");
  });

  it("should find private data in a WebP whose EXIF holds a serial number or a thumbnail", () => {
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ exif: [exifTag.bodySerial] }))] }))).toBe("private");
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ thumbnail: true }))] }))).toBe("private");
  });
});

describe("findPrivateData for a WebP", () => {
  it("should find nothing private in a WebP without EXIF, and read its EXIF chunk", () => {
    expect(findPrivateData("image/webp", webpBytes())).toBe("none");
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ orientation: 1 }))] }))).toBe("none");
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("EXIF", tiffBlock({ gps: true }))] }))).toBe("private");
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("EXIF", [...ascii("Exif\0\0"), ...tiffBlock({ gps: true, little: true })])] }))).toBe("private");
  });

  it("should read its XMP chunk", () => {
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("XMP ", ascii("<exif:GPSAltitude>12</exif:GPSAltitude>"))] }))).toBe("private");
  });

  it("should not tell for an unknown chunk, a size that disagrees with the file, or a file cut short", () => {
    expect(findPrivateData("image/webp", webpBytes({ chunks: [webpChunk("abcd", [1, 2])] }))).toBe("unknown");
    expect(findPrivateData("image/webp", webpBytes({ riffExtra: 4 }))).toBe("unknown");
    expect(findPrivateData("image/webp", new Uint8Array([...webpBytes(), 0, 0]))).toBe("unknown");
    const whole = webpBytes();
    expect(findPrivateData("image/webp", whole.subarray(0, whole.length - 3))).toBe("unknown");
  });
});

describe("findPrivateData for other files", () => {
  it("should not tell for a type it cannot check, or for bytes that are not the type they claim", () => {
    expect(findPrivateData("image/avif", new Uint8Array([0, 0, 0, 0x1c, ...ascii("ftypavif")]))).toBe("unknown");
    expect(findPrivateData("image/heic", new Uint8Array(16))).toBe("unknown");
    expect(findPrivateData("image/png", jpegBytes())).toBe("unknown");
    expect(findPrivateData("image/jpeg", pngBytes())).toBe("unknown");
    expect(findPrivateData("image/webp", new Uint8Array())).toBe("unknown");
  });

  it("should never throw, whatever the bytes", () => {
    let seed = 11;
    for (let round = 0; round < 300; round += 1) {
      const bytes = new Uint8Array(64).map(() => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % 256;
      });
      bytes.set([0xff, 0xd8], 0);
      expect(() => findPrivateData("image/jpeg", bytes)).not.toThrow();
      expect(() => findPrivateData("image/png", bytes)).not.toThrow();
      expect(() => findPrivateData("image/webp", bytes)).not.toThrow();
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
