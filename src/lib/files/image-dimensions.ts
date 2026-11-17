import { readImageHeader } from "./image-size-rules";

/**
 * The pixel size an uploaded image is drawn at, read from its first bytes
 * when the upload is finished (uploads.ts), so a page can keep the image's
 * place before it loads (FileDto.width and height). PNG, GIF, WebP, JPEG,
 * and AVIF are read; a JPEG whose camera orientation turns it on its side
 * has its sides swapped, as browsers draw it. The bytes are an uploader's:
 * a size outside `maxImageSide` is not kept, and nothing here is trusted
 * for more than a placeholder's shape. Pure.
 */

/** How many leading bytes the server reads to find an image's size: enough for a camera JPEG's EXIF block before its frame header. */
export const imageDimensionBytes = 262_144;

/** The longest side kept. No real image an upload may hold is larger, and a page never reserves more. */
export const maxImageSide = 65_535;

/** An image's pixel size. */
export interface ImageDimensions {
  width: number;
  height: number;
}

/** The size when both sides are whole numbers from 1 to `maxImageSide`, else null. */
export function keptDimensions(width: unknown, height: unknown): ImageDimensions | null {
  const ok = (side: unknown): side is number => typeof side === "number" && Number.isInteger(side) && side >= 1 && side <= maxImageSide;
  return ok(width) && ok(height) ? { width, height } : null;
}

function text(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || bytes.length < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

/** The unsigned integer in `count` bytes at `offset`, in either byte order; 0 past the end. */
function uint(bytes: Uint8Array, offset: number, count: number, little: boolean): number {
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    const at = little ? offset + count - 1 - index : offset + index;
    value = value * 256 + (bytes[at] ?? 0);
  }
  return value;
}

/** PNG: the signature, then the IHDR chunk with width and height as 32-bit numbers. */
function pngSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24 || !text(bytes, 1, "PNG") || !text(bytes, 12, "IHDR")) return null;
  return keptDimensions(uint(bytes, 16, 4, false), uint(bytes, 20, 4, false));
}

/** GIF: the logical screen's width and height, 16 bits each, after the six-byte signature. */
function gifSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || !(text(bytes, 0, "GIF87a") || text(bytes, 0, "GIF89a"))) return null;
  return keptDimensions(uint(bytes, 6, 2, true), uint(bytes, 8, 2, true));
}

/**
 * AVIF: the largest `ispe` (image spatial extents) box in the bytes given.
 * The picture's own box is the largest: a thumbnail and the tiles of a grid
 * are smaller, and an alpha plane is the same size. An `irot` box that
 * turns the picture a quarter or three quarters swaps the sides.
 */
function avifSize(bytes: Uint8Array): ImageDimensions | null {
  if (!text(bytes, 4, "ftyp")) return null;
  let best: ImageDimensions | null = null;
  let turned = false;
  for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
    if (text(bytes, offset, "irot")) turned = ((bytes[offset + 4] ?? 0) & 1) === 1;
    if (text(bytes, offset, "ispe")) best = larger(best, keptDimensions(uint(bytes, offset + 8, 4, false), uint(bytes, offset + 12, 4, false)));
  }
  if (!best) return null;
  return turned ? { width: best.height, height: best.width } : best;
}

/** The one of two sizes that covers more pixels; null only when both are. */
function larger(one: ImageDimensions | null, other: ImageDimensions | null): ImageDimensions | null {
  if (!one || !other) return one ?? other;
  return other.width * other.height > one.width * one.height ? other : one;
}

/** The value of the Orientation tag (0x0112) in a TIFF block that starts at `tiff`, or 1 when it has none. */
function tiffOrientation(bytes: Uint8Array, tiff: number): number {
  const little = text(bytes, tiff, "II");
  if (!little && !text(bytes, tiff, "MM")) return 1;
  const directory = tiff + uint(bytes, tiff + 4, 4, little);
  const entries = uint(bytes, directory, 2, little);
  for (let index = 0; index < Math.min(entries, 64); index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > bytes.length) return 1;
    if (uint(bytes, entry, 2, little) === 0x0112) return uint(bytes, entry + 8, 2, little);
  }
  return 1;
}

/** The camera orientation a JPEG states in its EXIF block (1 to 8), or 1 when it states none before its first scan. */
export function jpegOrientation(bytes: Uint8Array): number {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = uint(bytes, offset + 2, 2, false);
    if (length < 2) return 1;
    if (marker === 0xe1 && text(bytes, offset + 4, "Exif\0\0")) return tiffOrientation(bytes, offset + 10);
    offset += 2 + length;
  }
  return 1;
}

/** JPEG and WebP: the size their header states (image-size-rules.ts), with a JPEG's sides swapped when its orientation turns it on its side. */
function headerSize(bytes: Uint8Array): ImageDimensions | null {
  const header = readImageHeader(bytes);
  if (!header) return null;
  const orientation = header.type === "image/jpeg" ? jpegOrientation(bytes) : 1;
  const onItsSide = orientation >= 5 && orientation <= 8;
  return onItsSide ? keptDimensions(header.height, header.width) : keptDimensions(header.width, header.height);
}

const readers: Record<string, (bytes: Uint8Array) => ImageDimensions | null> = {
  "image/png": pngSize,
  "image/gif": gifSize,
  "image/avif": avifSize,
  "image/jpeg": headerSize,
  "image/webp": headerSize,
};

/** True for a type whose size this file reads. */
export function hasReadableDimensions(contentType: string): boolean {
  return Object.hasOwn(readers, contentType);
}

/**
 * The size an image of `contentType` is drawn at, from its first bytes
 * (pass up to `imageDimensionBytes`), or null when the type is not an image
 * this reads, the header is cut or broken, or a side is out of range.
 */
export function readImageDimensions(contentType: string, bytes: Uint8Array): ImageDimensions | null {
  const read = Object.hasOwn(readers, contentType) ? readers[contentType] : undefined;
  return read ? read(bytes) : null;
}
