/**
 * Reads an image's type and pixel size from its first bytes, for frame
 * captures (src/lib/canvas/captures.ts): the server checks that each stored
 * part is the picture the tab said it would upload. Only WebP and JPEG are
 * read, the two types a part may have; anything else is refused. The type
 * comes from the bytes, never from a name or a header. Pure.
 */

/**
 * How many leading bytes of a part the server reads. A WebP states its size
 * in its first 30 bytes. A JPEG states it in its first frame header, which
 * follows the segments before it (JFIF, the quantization tables, and a color
 * profile where the browser adds one); a JPEG whose frame header starts
 * past these bytes is refused.
 */
export const imageHeaderBytes = 4_096;

/** The types this file reads. */
export type SizedImageType = "image/webp" | "image/jpeg";

/** What the first bytes say an image is. */
export interface ImageHeader {
  type: SizedImageType;
  width: number;
  height: number;
}

function matches(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/** The unsigned integer in `count` little-endian bytes at `offset`. The caller checked the length. */
function littleEndian(bytes: Uint8Array, offset: number, count: number): number {
  let value = 0;
  for (let index = count - 1; index >= 0; index -= 1) value = value * 256 + (bytes[offset + index] ?? 0);
  return value;
}

function sized(type: SizedImageType, width: number, height: number): ImageHeader | null {
  return width > 0 && height > 0 ? { type, width, height } : null;
}

/** Extended WebP (VP8X): the canvas size, each as 24 bits less one. */
function extendedWebp(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 30) return null;
  return sized("image/webp", littleEndian(bytes, 24, 3) + 1, littleEndian(bytes, 27, 3) + 1);
}

/** Lossy WebP (VP8): a key frame's start code, then width and height in 14 bits each. */
function lossyWebp(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 30) return null;
  const keyFrame = ((bytes[20] ?? 1) & 1) === 0;
  const startCode = bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a;
  if (!keyFrame || !startCode) return null;
  return sized("image/webp", littleEndian(bytes, 26, 2) & 0x3fff, littleEndian(bytes, 28, 2) & 0x3fff);
}

/** Lossless WebP (VP8L): a signature byte, then width and height in 14 bits each, less one. */
function losslessWebp(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
  const bits = littleEndian(bytes, 21, 4);
  return sized("image/webp", (bits & 0x3fff) + 1, (Math.floor(bits / 0x4000) & 0x3fff) + 1);
}

function webpHeader(bytes: Uint8Array): ImageHeader | null {
  if (matches(bytes, 12, "VP8X")) return extendedWebp(bytes);
  if (matches(bytes, 12, "VP8 ")) return lossyWebp(bytes);
  if (matches(bytes, 12, "VP8L")) return losslessWebp(bytes);
  return null;
}

/** JPEG markers that start a frame and state its size: SOF0 to SOF15, without the three that are tables. */
function isFrameStart(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** JPEG markers that end the search: the scan starts (SOS) or the image ends (EOI) before any frame header. */
function endsHeaders(marker: number): boolean {
  return marker === 0xda || marker === 0xd9;
}

/** The unsigned integer in two big-endian bytes at `offset`, or 0 past the end. */
function bigEndian16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
}

/** A JPEG frame header at `offset`: the marker, a length, the precision, then height and width. */
function jpegFrame(bytes: Uint8Array, offset: number): ImageHeader | null {
  if (offset + 9 > bytes.length) return null;
  return sized("image/jpeg", bigEndian16(bytes, offset + 7), bigEndian16(bytes, offset + 5));
}

/** Walks a JPEG's segments from the start to its first frame header. */
function jpegHeader(bytes: Uint8Array): ImageHeader | null {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const marker = bytes[offset + 1] ?? 0;
    if (bytes[offset] !== 0xff || endsHeaders(marker)) return null;
    if (isFrameStart(marker)) return jpegFrame(bytes, offset);
    const length = bigEndian16(bytes, offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/**
 * The type and pixel size the first bytes of a file state, or null when
 * they are not a WebP or a JPEG this file can read: another format, a cut
 * or broken header, a size of zero, or a JPEG whose frame header is not
 * within the bytes given. Pass the first `imageHeaderBytes` of the file.
 */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (matches(bytes, 0, "RIFF") && matches(bytes, 8, "WEBP")) return webpHeader(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegHeader(bytes);
  return null;
}
