/**
 * Whether a picked JPEG, PNG, or WebP says where it was taken. A small
 * still image goes into a document with its own bytes only when this finds
 * positively that it says nothing of the place (document-image.ts); any
 * other answer means the browser redraws it, which drops every camera tag.
 *
 * It reads the bytes it is given and nothing else, never throws, and every
 * loop moves forward by at least one byte, whatever lengths the file states.
 * Whatever it cannot read for certain (a segment or chunk it does not know,
 * a compressed text block, a file cut short, bytes after the end of the
 * picture, any other type) is "unknown", never "none". Pure.
 */

/** What the bytes say about a location: none (checked, nothing found), location (a GPS block or a place in the text), or unknown (not checked for certain). */
export type LocationFinding = "none" | "location" | "unknown";

/** The Exif tag that points at the GPS block, in the first image directory. */
const gpsPointerTag = 0x8825;

/** Words in an XMP packet or a text block that name a place. */
const placeWords = /gps|location|photoshop:(city|state|country)/i;

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

/** Whether the text in `bytes` from `start` to `end` names a place. */
function textFinding(bytes: Uint8Array, start: number, end: number): LocationFinding {
  return placeWords.test(new TextDecoder().decode(bytes.subarray(start, end))) ? "location" : "none";
}

/**
 * An Exif (TIFF) block from `start` to `end`: "location" when its first
 * image directory has the GPS pointer, "none" when it has not, "unknown"
 * when the block is not one or is cut short.
 */
export function exifFinding(bytes: Uint8Array, start: number, end: number): LocationFinding {
  const from = ascii(bytes, start, "Exif\0\0") ? start + 6 : start;
  const limit = Math.min(end, bytes.length);
  if (from + 8 > limit) return "unknown";
  const little = ascii(bytes, from, "II");
  if (!little && !ascii(bytes, from, "MM")) return "unknown";
  if (uint(bytes, from + 2, 2, little) !== 42) return "unknown";
  const directory = from + uint(bytes, from + 4, 4, little);
  if (directory + 2 > limit) return "unknown";
  const entries = uint(bytes, directory, 2, little);
  if (directory + 2 + entries * 12 > limit) return "unknown";
  for (let index = 0; index < entries; index += 1) {
    if (uint(bytes, directory + 2 + index * 12, 2, little) === gpsPointerTag) return "location";
  }
  return "none";
}

const xmpNames = ["http://ns.adobe.com/xap/1.0/\0", "http://ns.adobe.com/xmp/extension/\0"];

/** An APP1 segment: Exif or XMP; any other kind is not read. */
function app1Finding(bytes: Uint8Array, start: number, end: number): LocationFinding {
  if (ascii(bytes, start, "Exif\0\0")) return exifFinding(bytes, start, end);
  return xmpNames.some((name) => ascii(bytes, start, name)) ? textFinding(bytes, start, end) : "unknown";
}

/** One JPEG segment before the first scan, by its marker. Only segments known to hold no place, or read here, can be "none". */
function jpegSegmentFinding(marker: number, bytes: Uint8Array, start: number, end: number): LocationFinding {
  if (marker === 0xe0) return "none";
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
function jpegTailFinding(bytes: Uint8Array, from: number): LocationFinding {
  for (let at = from; at + 1 < bytes.length; at += 1) {
    if (bytes[at] !== 0xff) continue;
    const next = bytes[at + 1] ?? 0;
    if (next === 0xd9) return at + 2 === bytes.length ? "none" : "unknown";
    if (isAppOrComment(next)) return "unknown";
  }
  return "unknown";
}

/** True for a marker that has no length after it (start, end, restart), which has no place before the first scan. */
const isStandalone = (marker: number) => marker >= 0xd0 && marker <= 0xd9;

/** A JPEG: every segment before the first scan, then the scan data to the end. */
function jpegFinding(bytes: Uint8Array): LocationFinding {
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

/** PNG chunks that hold pictures, colors, timing, or layout, and never a place. `iDOT` is what macOS adds to every screenshot. */
const plainPngChunks: ReadonlySet<string> = new Set([
  "IHDR", "PLTE", "IDAT", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "hIST", "pHYs", "sPLT", "tIME",
  "cICP", "mDCV", "mDCv", "cLLI", "cLLi", "acTL", "fcTL", "fdAT", "iDOT",
]);

/** A PNG text block (`tEXt`, or `iTXt` with `international`): its words, unless it is compressed or holds a raw profile (camera tags written out as hex). */
function pngTextFinding(bytes: Uint8Array, start: number, end: number, international: boolean): LocationFinding {
  if (ascii(bytes, start, "Raw profile type")) return "unknown";
  const keywordEnd = bytes.subarray(start, end).indexOf(0);
  if (keywordEnd < 0) return "unknown";
  if (international && bytes[start + keywordEnd + 1] !== 0) return "unknown";
  return textFinding(bytes, start, end);
}

function pngChunkFinding(type: string, bytes: Uint8Array, start: number, end: number): LocationFinding {
  if (plainPngChunks.has(type)) return "none";
  if (type === "eXIf") return exifFinding(bytes, start, end);
  if (type === "tEXt" || type === "iTXt") return pngTextFinding(bytes, start, end, type === "iTXt");
  return "unknown";
}

const chunkName = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** A PNG: every chunk up to `IEND`, which must be the last bytes of the file. */
function pngFinding(bytes: Uint8Array): LocationFinding {
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

function webpChunkFinding(type: string, bytes: Uint8Array, start: number, end: number): LocationFinding {
  if (plainWebpChunks.has(type)) return "none";
  if (type === "EXIF") return exifFinding(bytes, start, end);
  return type === "XMP " ? textFinding(bytes, start, end) : "unknown";
}

/** A WebP: every chunk of its RIFF container, which must end where the file ends. */
function webpFinding(bytes: Uint8Array): LocationFinding {
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

const readers: Record<string, (bytes: Uint8Array) => LocationFinding> = {
  "image/jpeg": jpegFinding,
  "image/png": pngFinding,
  "image/webp": webpFinding,
};

/** The types this file can check. Every other type is "unknown". */
export const locationCheckedTypes: ReadonlySet<string> = new Set(Object.keys(readers));

/**
 * What a whole image file of `type` says about where it was taken. Pass
 * the whole file: the end of a JPEG, PNG, or WebP is checked too, since a
 * phone can join a second picture or a video after the first. Never throws.
 */
export function findLocation(type: string, bytes: Uint8Array): LocationFinding {
  const read = Object.hasOwn(readers, type) ? readers[type] : undefined;
  if (!read) return "unknown";
  try {
    return read(bytes);
  } catch {
    return "unknown";
  }
}
