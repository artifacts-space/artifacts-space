import type { AllowedFileType } from "./config";

/** How many leading bytes the finalize step reads to check a file's type. */
export const signatureBytes = 16;

type Matcher = (bytes: Uint8Array) => boolean;

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((value, index) => bytes[offset + index] === value);
}

const encoder = new TextEncoder();

/** The bytes of an ASCII marker such as "%PDF-". */
function ascii(text: string): number[] {
  return Array.from(encoder.encode(text));
}

const zip: Matcher = (bytes) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
const isoMedia = (brands: readonly string[]): Matcher => (bytes) =>
  startsWith(bytes, ascii("ftyp"), 4) && (brands.length === 0 || brands.some((brand) => startsWith(bytes, ascii(brand), 8)));
const riff = (form: string): Matcher => (bytes) => startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii(form), 8);
const mp3: Matcher = (bytes) => startsWith(bytes, ascii("ID3")) || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
/** Text formats: no NUL bytes in the first bytes. */
const text: Matcher = (bytes) => !bytes.includes(0);

/** The leading-bytes check for every allowed type. */
const matchers: Record<AllowedFileType, Matcher> = {
  "image/png": (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  "image/gif": (bytes) => startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a")),
  "image/webp": riff("WEBP"),
  "image/avif": isoMedia(["avif", "avis", "mif1", "msf1"]),
  "application/pdf": (bytes) => startsWith(bytes, ascii("%PDF-")),
  "text/plain": text,
  "text/csv": text,
  "application/json": text,
  "application/zip": zip,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": zip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": zip,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": zip,
  "video/mp4": isoMedia([]),
  "video/webm": (bytes) => startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  "audio/mpeg": mp3,
  "audio/wav": riff("WAVE"),
};

/**
 * True when the first bytes of a file look like its declared type, so a
 * renamed executable cannot pass as an image. `bytes` is the start of the
 * file (at least `signatureBytes` long, unless the file is shorter).
 */
export function matchesFileSignature(contentType: AllowedFileType, bytes: Uint8Array): boolean {
  return matchers[contentType](bytes);
}
