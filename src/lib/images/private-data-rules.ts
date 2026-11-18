/**
 * Whether a picked JPEG, PNG, or WebP carries data that must not reach a
 * shared page as it is: where it was taken, who took it or which one device
 * did, or an embedded preview (which can show the whole frame of a picture
 * cropped since). A small still image goes into a document with its own
 * bytes only when this finds positively none of these (document-image.ts);
 * any other answer means the browser redraws it, which drops every camera
 * tag. Camera make and model, the time taken, exposure settings, the
 * editing software, the orientation, a user comment, and a color profile
 * are not private here, so screenshots keep their bytes.
 *
 * It reads the bytes it is given and nothing else, never throws, and every
 * loop moves forward by at least one byte, whatever lengths the file states.
 * Whatever it cannot read for certain (a segment or chunk it does not know,
 * a compressed text block, a file cut short, bytes after the end of the
 * picture, any other type) is "unknown", never "none". Pure.
 */

/** What the bytes say: none (checked, nothing private found), private (a place, a person, one device, or a preview), or unknown (not checked for certain). */
export type PrivateDataFinding = "none" | "private" | "unknown";

/**
 * Exif tags that make an image private, wherever the first directory or its
 * Exif directory holds them: the GPS block; Artist, Copyright, the owner's
 * name, the body and lens serial numbers, the image's unique id, the maker's
 * note (which often holds a serial number and more), and the author and
 * comment tags of one desktop system (0x9C9B to 0x9C9F); and a preview
 * (JPEGInterchangeFormat and its length, or sub-images).
 */
const privateTags: ReadonlySet<number> = new Set([
  0x8825, 0x013b, 0x8298, 0xa430, 0xa431, 0xa435, 0xa420, 0x927c, 0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e, 0x9c9f, 0x0201, 0x0202, 0x014a,
]);

/** The tag in the first directory that points at the Exif directory. */
const exifPointerTag = 0x8769;

/**
 * Words in an XMP packet or a text block that name a place, a person, a
 * device's serial, or an embedded preview. `CreatorTool` names software,
 * which may stay; any other "creator" is a person.
 */
const privateWords = /gps|location|photoshop:(city|state|country)|creator(?!tool)|author|rights|copyright|owner|serial|thumbnails|xapgimg/i;

function ascii(bytes: Uint8Array, at: number, word: string): boolean {
  if (at < 0 || at + word.length > bytes.length) return false;
  for (let index = 0; index < word.length; index += 1) {
    if (bytes[at + index] !== word.charCodeAt(index)) return false;
  }
  return true;
}

/** The unsigned number in `count` bytes at `at`, in either byte order. Callers check the bytes are there. */
function uint(bytes: Uint8Array, at: number, count: number, little: boolean): number {
  let value = 0;
  for (let index = 0; index < count; index += 1) value = value * 256 + (bytes[little ? at + count - 1 - index : at + index] ?? 0);
  return value;
}

/** Whether the text in `bytes` from `start` to `end` names a place, a person, a serial, or a preview. */
function textFinding(bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  return privateWords.test(new TextDecoder().decode(bytes.subarray(start, end))) ? "private" : "none";
}

/** A TIFF block as Exif holds it: where it starts, where it must end, and its byte order. */
interface Tiff {
  bytes: Uint8Array;
  start: number;
  limit: number;
  little: boolean;
}

/** One image directory: what its tags say, where its Exif directory is (when it points at one), and the offset of the next directory (0 for none). */
interface Directory {
  finding: PrivateDataFinding;
  exif: number | null;
  next: number;
}

/** Reads the directory at `offset` from the TIFF start, or null when it is past or across the end of the block. */
function readDirectory(tiff: Tiff, offset: number): Directory | null {
  const { bytes, start, limit, little } = tiff;
  const at = start + offset;
  if (offset < 8 || at + 2 > limit) return null;
  const entries = uint(bytes, at, 2, little);
  const nextAt = at + 2 + entries * 12;
  if (nextAt + 4 > limit) return null;
  let exif: number | null = null;
  for (let index = 0; index < entries; index += 1) {
    const entry = at + 2 + index * 12;
    const tag = uint(bytes, entry, 2, little);
    if (privateTags.has(tag)) return { finding: "private", exif: null, next: 0 };
    if (tag === exifPointerTag) exif = uint(bytes, entry + 8, 4, little);
  }
  return { finding: "none", exif, next: uint(bytes, nextAt, 4, little) };
}

/** The TIFF header at `from`, or null when there is none. */
function tiffAt(bytes: Uint8Array, from: number, limit: number): Tiff | null {
  if (from + 8 > limit) return null;
  const little = ascii(bytes, from, "II");
  if (!little && !ascii(bytes, from, "MM")) return null;
  return uint(bytes, from + 2, 2, little) === 42 ? { bytes, start: from, limit, little } : null;
}

/**
 * An Exif (TIFF) block from `start` to `end`: "private" when the first
 * image directory or its Exif directory holds a private tag, or when a
 * second image directory (a thumbnail) follows the first; "none" when it
 * holds none; "unknown" when the block is not one or is cut short.
 */
export function exifFinding(bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  const tiff = tiffAt(bytes, ascii(bytes, start, "Exif\0\0") ? start + 6 : start, Math.min(end, bytes.length));
  if (!tiff) return "unknown";
  const first = readDirectory(tiff, uint(bytes, tiff.start + 4, 4, tiff.little));
  if (!first) return "unknown";
  if (first.finding !== "none" || first.next !== 0) return "private";
  if (first.exif === null) return "none";
  return readDirectory(tiff, first.exif)?.finding ?? "unknown";
}

/** A JPEG APP0 segment: plain JFIF without a thumbnail; a JFIF thumbnail or a JFXX extension is a preview. */
function app0Finding(bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  if (ascii(bytes, start, "JFXX\0")) return "private";
  if (!ascii(bytes, start, "JFIF\0") || start + 14 > end) return "unknown";
  return bytes[start + 12] === 0 && bytes[start + 13] === 0 ? "none" : "private";
}

const xmpNames = ["http://ns.adobe.com/xap/1.0/\0", "http://ns.adobe.com/xmp/extension/\0"];

/** An APP1 segment: Exif or XMP; any other kind is not read. */
function app1Finding(bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  if (ascii(bytes, start, "Exif\0\0")) return exifFinding(bytes, start, end);
  return xmpNames.some((name) => ascii(bytes, start, name)) ? textFinding(bytes, start, end) : "unknown";
}

/** One JPEG segment before the first scan, by its marker. Only segments known to hold nothing private, or read here, can be "none". */
function jpegSegmentFinding(marker: number, bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  if (marker === 0xe0) return app0Finding(bytes, start, end);
  if (marker === 0xe1) return app1Finding(bytes, start, end);
  if (marker === 0xe2) return ascii(bytes, start, "ICC_PROFILE\0") ? "none" : "unknown";
  if (marker === 0xee) return ascii(bytes, start, "Adobe") ? "none" : "unknown";
  if (marker === 0xfe) return textFinding(bytes, start, end);
  // Other application segments (IPTC, a second picture's index, a maker's own) are not read.
  return marker >= 0xe3 && marker <= 0xef ? "unknown" : "none";
}

/** True for a marker of an application or comment segment. */
const isAppOrComment = (marker: number) => (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;

/**
 * From the first scan to the end: "none" only when the picture's end
 * marker is the last two bytes and no application or comment segment
 * comes after the scan. A second picture or a video joined after the end
 * (where some phones keep one) is "unknown".
 */
function jpegTailFinding(bytes: Uint8Array, from: number): PrivateDataFinding {
  for (let at = from; at + 1 < bytes.length; at += 1) {
    if (bytes[at] !== 0xff) continue;
    const next = bytes[at + 1] ?? 0;
    if (next === 0xd9) return at + 2 === bytes.length ? "none" : "unknown";
    if (isAppOrComment(next)) return "unknown";
  }
  return "unknown";
}

/** True for a marker that has no length after it (start, end, restart), which does not belong before the first scan. */
const isStandalone = (marker: number) => marker >= 0xd0 && marker <= 0xd9;

/** A JPEG: every segment before the first scan, then the scan data to the end. */
function jpegFinding(bytes: Uint8Array): PrivateDataFinding {
  if (!ascii(bytes, 0, "\xff\xd8")) return "unknown";
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return "unknown";
    const marker = uint(bytes, at + 1, 1, false);
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (isStandalone(marker)) return "unknown";
    const end = at + 2 + uint(bytes, at + 2, 2, false);
    if (end < at + 4 || end > bytes.length) return "unknown";
    if (marker === 0xda) return jpegTailFinding(bytes, end);
    const finding = jpegSegmentFinding(marker, bytes, at + 4, end);
    if (finding !== "none") return finding;
    at = end;
  }
  return "unknown";
}

/** PNG chunks that hold pictures, colors, timing, or layout, and nothing private. `iDOT` is what macOS adds to every screenshot. */
const plainPngChunks: ReadonlySet<string> = new Set([
  "IHDR", "PLTE", "IDAT", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "hIST", "pHYs", "sPLT", "tIME",
  "cICP", "mDCV", "mDCv", "cLLI", "cLLi", "acTL", "fcTL", "fdAT", "iDOT",
]);

/** A PNG text block (`tEXt`, or `iTXt` with `international`): its words, unless it is compressed or holds a raw profile (camera tags written out as hex). */
function pngTextFinding(bytes: Uint8Array, start: number, end: number, international: boolean): PrivateDataFinding {
  if (ascii(bytes, start, "Raw profile type")) return "unknown";
  const keywordEnd = bytes.subarray(start, end).indexOf(0);
  if (keywordEnd < 0) return "unknown";
  if (international && bytes[start + keywordEnd + 1] !== 0) return "unknown";
  return textFinding(bytes, start, end);
}

function pngChunkFinding(type: string, bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  if (plainPngChunks.has(type)) return "none";
  if (type === "eXIf") return exifFinding(bytes, start, end);
  if (type === "tEXt" || type === "iTXt") return pngTextFinding(bytes, start, end, type === "iTXt");
  return "unknown";
}

const chunkName = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** A PNG: every chunk up to `IEND`, which must be the last bytes of the file. */
function pngFinding(bytes: Uint8Array): PrivateDataFinding {
  if (!ascii(bytes, 0, "\x89PNG\r\n\x1a\n")) return "unknown";
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = uint(bytes, at, 4, false);
    const type = chunkName(bytes, at + 4);
    const end = at + 12 + length;
    if (end > bytes.length) return "unknown";
    if (type === "IEND") return end === bytes.length ? "none" : "unknown";
    const finding = pngChunkFinding(type, bytes, at + 8, at + 8 + length);
    if (finding !== "none") return finding;
    at = end;
  }
  return "unknown";
}

const plainWebpChunks: ReadonlySet<string> = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP", "ANIM", "ANMF"]);

function webpChunkFinding(type: string, bytes: Uint8Array, start: number, end: number): PrivateDataFinding {
  if (plainWebpChunks.has(type)) return "none";
  if (type === "EXIF") return exifFinding(bytes, start, end);
  return type === "XMP " ? textFinding(bytes, start, end) : "unknown";
}

/** A WebP: every chunk of its RIFF container, which must end where the file ends. */
function webpFinding(bytes: Uint8Array): PrivateDataFinding {
  if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return "unknown";
  const riffEnd = 8 + uint(bytes, 4, 4, true);
  if (riffEnd !== bytes.length) return "unknown";
  let at = 12;
  while (at + 8 <= riffEnd) {
    const size = uint(bytes, at + 4, 4, true);
    const dataEnd = at + 8 + size;
    if (dataEnd > riffEnd) return "unknown";
    const finding = webpChunkFinding(chunkName(bytes, at), bytes, at + 8, dataEnd);
    if (finding !== "none") return finding;
    at = dataEnd + (size % 2);
  }
  return at >= riffEnd ? "none" : "unknown";
}

const readers: Record<string, (bytes: Uint8Array) => PrivateDataFinding> = {
  "image/jpeg": jpegFinding,
  "image/png": pngFinding,
  "image/webp": webpFinding,
};

/** The types this file can check. Every other type is "unknown". */
export const privateDataCheckedTypes: ReadonlySet<string> = new Set(Object.keys(readers));

/**
 * What a whole image file of `type` carries: a place, a person, one device,
 * or a preview ("private"), none of these, or "unknown". Pass the whole
 * file: the end of a JPEG, PNG, or WebP is checked too, since a phone can
 * join a second picture or a video after the first. Never throws.
 */
export function findPrivateData(type: string, bytes: Uint8Array): PrivateDataFinding {
  const read = Object.hasOwn(readers, type) ? readers[type] : undefined;
  if (!read) return "unknown";
  try {
    return read(bytes);
  } catch {
    return "unknown";
  }
}
