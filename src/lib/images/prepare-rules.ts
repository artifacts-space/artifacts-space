import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";
import { binaryMegabytes } from "@/lib/format-bytes";
import { ICON_MAX_BYTES } from "@/lib/files/icon-rules";

/**
 * How the browser prepares a picked image before it uploads as a cover, an
 * icon, or an image in a document: scaled down to a sensible size and re-encoded, so a phone photo fits
 * the cap, carries no camera metadata (no GPS in a public page), and is a
 * JPEG or PNG that link previews can draw. Pure, so it is tested without a
 * browser; src/components/images/prepare-image.ts does the drawing. The
 * server still checks every upload: this only helps honest uploads succeed.
 */

/** What a prepared image is for, and the limits that follow from it. */
export interface ImagePrepareProfile {
  /** The use, for messages and the fallback file name. */
  use: "cover" | "icon" | "document";
  /** Longest side of the prepared image, in pixels. */
  maxSide: number;
  /** The server's cap for this use, in bytes. */
  maxBytes: number;
  /** Largest picked file whose transparency is kept (as a PNG, when it fits the cap); bigger ones become JPEG. */
  alphaSourceMaxBytes: number;
  /** Keep a PNG a PNG (when it is within alphaSourceMaxBytes and fits the cap), so screenshots stay sharp. */
  keepPngSources?: boolean;
}

/** Largest picked file the browser tries to prepare (50 MB): bigger ones are refused before decoding. */
export const IMAGE_SOURCE_MAX_BYTES = 52_428_800;

/** Covers: a 180 px tall banner on a 3x wide screen needs far less than 2400 px. */
export const coverPrepareProfile: ImagePrepareProfile = { use: "cover", maxSide: 2400, maxBytes: COVER_MAX_BYTES, alphaSourceMaxBytes: COVER_MAX_BYTES };

/**
 * Icons: drawn at most a few dozen pixels wide, so 512 px is plenty on any
 * screen. A transparent logo of any size stays a PNG when it fits 1 MB.
 */
export const iconPrepareProfile: ImagePrepareProfile = { use: "icon", maxSide: 512, maxBytes: ICON_MAX_BYTES, alphaSourceMaxBytes: IMAGE_SOURCE_MAX_BYTES };

/** Largest prepared image in a document (8 MB), well under the 25 MB file cap. */
export const DOCUMENT_IMAGE_MAX_BYTES = 8_388_608;

/**
 * Images in a document: 2400 px fills a wide text column on a 3x screen.
 * Screenshots stay PNG when they fit; photos become JPEG.
 */
export const documentPrepareProfile: ImagePrepareProfile = {
  use: "document",
  maxSide: 2400,
  maxBytes: DOCUMENT_IMAGE_MAX_BYTES,
  alphaSourceMaxBytes: DOCUMENT_IMAGE_MAX_BYTES,
  keepPngSources: true,
};

/** JPEG quality for a prepared image, then the fallbacks tried while it is still over the cap. */
export const imageJpegQualities = [0.84, 0.72, 0.6] as const;

const sourceTypes: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif"]);
const heicName = /\.(heic|heif)$/i;
/** Types that may carry transparency. JPEG never does. */
const alphaTypes: ReadonlySet<string> = new Set(["image/png", "image/gif", "image/webp", "image/avif"]);

/** What the pickers accept: the icon and cover image types, plus HEIC photos, which some browsers can open. */
export const IMAGE_SOURCE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,image/heif,.heic,.heif";

const useNames: Record<ImagePrepareProfile["use"], string> = { cover: "a cover", icon: "an icon", document: "an image here" };

/** True when the picked file is a HEIC or HEIF photo (by type, or by name when the browser gives no type). */
export function isHeic(file: { type: string; name: string }): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || (file.type === "" && heicName.test(file.name));
}

/**
 * Why a picked file cannot be prepared for `profile`'s use, written for the
 * person who picked it, or null when the browser should try.
 */
export function imageSourceProblem(file: { type: string; name: string; size: number }, profile: ImagePrepareProfile): string | null {
  if (!sourceTypes.has(file.type) && !isHeic(file)) return `That file cannot be ${useNames[profile.use]}. Pick a photo or image: JPEG, PNG, GIF, WebP, AVIF, or HEIC.`;
  if (file.size === 0) return "That file is empty. Pick another image.";
  if (file.size > IMAGE_SOURCE_MAX_BYTES) return `That image is too large to prepare. Pick one under ${binaryMegabytes(IMAGE_SOURCE_MAX_BYTES)}.`;
  return null;
}

/** The size to draw an image at: scaled down so its longest side is at most `maxSide`, never scaled up. */
export function imageTargetSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True when the picked file's type can carry transparency, so the drawn pixels are worth checking. */
export function mayHaveAlpha(type: string): boolean {
  return alphaTypes.has(type);
}

/**
 * The type to encode a prepared image as. PNG for an image with
 * transparency from a source small enough for the profile (a JPEG would fill
 * it in), and for any PNG when the profile keeps PNG sources; everything
 * else, including every photo, becomes a JPEG.
 */
export function imageOutputType(source: { size: number; type?: string }, hasAlpha: boolean, profile: ImagePrepareProfile): "image/png" | "image/jpeg" {
  const keepsPng = profile.keepPngSources === true && source.type === "image/png";
  return (hasAlpha || keepsPng) && source.size <= profile.alphaSourceMaxBytes ? "image/png" : "image/jpeg";
}

/**
 * True when a picked image uploads as it is, without preparing: a GIF that
 * fits the cap keeps its animation, and GIFs carry no camera data. Every
 * other image is redrawn, which drops camera data and caps its size.
 */
export function uploadsUnprepared(file: { type: string; size: number }, profile: ImagePrepareProfile): boolean {
  return file.type === "image/gif" && file.size > 0 && file.size <= profile.maxBytes;
}

/** True when RGBA pixel data has any pixel that is not fully opaque. */
export function hasTransparentPixel(rgba: ArrayLike<number>): boolean {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 255) return true;
  }
  return false;
}

/** The prepared file's name: the picked name with the new type's extension, or `fallback` when the name is only an extension. */
export function preparedFilename(name: string, type: "image/png" | "image/jpeg", fallback = "image"): string {
  const base = name.replace(/\.[^./\\]*$/, "").trim() || fallback;
  return `${base}.${type === "image/png" ? "png" : "jpg"}`;
}
