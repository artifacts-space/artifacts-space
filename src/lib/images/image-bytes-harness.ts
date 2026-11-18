/**
 * Hand-built image bytes for the tests of the location check and of what a
 * document image uploads as: just enough of a JPEG, PNG, or WebP for the
 * readers here and in image-dimensions.ts, with the camera tags a test
 * asks for. Used only by tests.
 */

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));
const be16 = (value: number) => [(value >> 8) & 255, value & 255];
const be32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const le32 = (value: number) => be32(value).reverse();
const gpsPointerTag = 0x8825;

/** What a test Exif block holds. */
export interface ExifTags {
  /** The GPS pointer (0x8825) in the first directory. */
  gps?: boolean;
  /** The camera orientation tag, 1 to 8. */
  orientation?: number;
  /** Little-endian ("II") instead of big-endian ("MM"). */
  little?: boolean;
}

/** A TIFF block, as Exif holds it: the byte order, 42, the first directory, and its entries (a camera model, then the tags asked for). */
export function tiffBlock({ gps = false, orientation, little = false }: ExifTags = {}): number[] {
  const u16 = (value: number) => (little ? be16(value).reverse() : be16(value));
  const u32 = (value: number) => (little ? le32(value) : be32(value));
  const entry = (tag: number, type: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(1), ...value];
  const entries = [
    entry(0x0110, 2, ascii("Cam\0")),
    ...(orientation === undefined ? [] : [entry(0x0112, 3, [...u16(orientation), 0, 0])]),
    ...(gps ? [entry(gpsPointerTag, 4, u32(0))] : []),
  ];
  return [...ascii(little ? "II" : "MM"), ...u16(42), ...u32(8), ...u16(entries.length), ...entries.flat(), ...u32(0)];
}

/** One JPEG segment: its marker, a length, and its payload. */
export const jpegSegment = (marker: number, payload: number[]) => [0xff, marker, ...be16(payload.length + 2), ...payload];

/** What a test JPEG holds. */
export interface JpegParts {
  width?: number;
  height?: number;
  /** An Exif APP1 segment with these tags. */
  exif?: ExifTags;
  /** An XMP APP1 packet with this text. */
  xmp?: string;
  /** More segments before the frame header. */
  segments?: number[][];
  /** Bytes after the end marker. */
  trailing?: number[];
}

/** A small baseline JPEG: start, optional Exif and XMP, a table, the frame header, one scan, and the end. */
export function jpegBytes({ width = 640, height = 480, exif, xmp, segments = [], trailing = [] }: JpegParts = {}): Uint8Array {
  const exifSegment = exif ? [jpegSegment(0xe1, [...ascii("Exif\0\0"), ...tiffBlock(exif)])] : [];
  const xmpSegment = xmp === undefined ? [] : [jpegSegment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/\0"), ...ascii(xmp)])];
  const table = jpegSegment(0xdb, new Array<number>(65).fill(1));
  const frame = jpegSegment(0xc0, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const scan = jpegSegment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const data = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78];
  return new Uint8Array([0xff, 0xd8, ...jpegSegment(0xe0, ascii("JFIF\0")), ...exifSegment.flat(), ...xmpSegment.flat(), ...segments.flat(), ...table, ...frame, ...scan, ...data, 0xff, 0xd9, ...trailing]);
}

/** One PNG chunk (its CRC left as zeros: nothing here checks it). */
export const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];

/** A small PNG: the signature, IHDR, the chunks given, one IDAT, IEND, then `trailing`. */
export function pngBytes({ width = 320, height = 200, chunks = [], trailing = [] }: { width?: number; height?: number; chunks?: number[][]; trailing?: number[] } = {}): Uint8Array {
  const header = pngChunk("IHDR", [...be32(width), ...be32(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([0x89, ...ascii("PNG\r\n\x1a\n"), ...header, ...chunks.flat(), ...pngChunk("IDAT", [1, 2, 3]), ...pngChunk("IEND", []), ...trailing]);
}

/** A PNG `eXIf` chunk with these tags. */
export const pngExif = (tags: ExifTags) => pngChunk("eXIf", tiffBlock(tags));

/** A PNG `iTXt` chunk, uncompressed, with this keyword and text. */
export const pngText = (keyword: string, text: string, compressed = false) => pngChunk("iTXt", [...ascii(keyword), 0, compressed ? 1 : 0, 0, 0, 0, ...ascii(text)]);

/** One WebP chunk, padded to an even length. */
export const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];

/** A small extended WebP: VP8X with its canvas size, the chunks given, and a VP8L picture. `riffExtra` changes the size the RIFF header states. */
export function webpBytes({ width = 320, height = 200, chunks = [], riffExtra = 0 }: { width?: number; height?: number; chunks?: number[][]; riffExtra?: number } = {}): Uint8Array {
  const side = (value: number) => le32(value - 1).slice(0, 3);
  const extended = webpChunk("VP8X", [0x08, 0, 0, 0, ...side(width), ...side(height)]);
  const body = [...ascii("WEBP"), ...extended, ...chunks.flat(), ...webpChunk("VP8L", [0x2f, 0, 0, 0, 0])];
  return new Uint8Array([...ascii("RIFF"), ...le32(body.length + riffExtra), ...body]);
}
