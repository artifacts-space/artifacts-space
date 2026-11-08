import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";

/**
 * How the browser prepares a picked image before it uploads as a cover:
 * scaled down to a sensible size and re-encoded, so a phone photo fits the
 * 2 MB cap, carries no camera metadata (no GPS in a public cover), and is a
 * JPEG or PNG that link previews can draw. Pure, so it is tested without a
 * browser; prepare-cover-image.ts does the drawing. The server still checks
 * every upload: this only helps honest uploads succeed.
 */

/** Longest side of a prepared cover, in pixels. A 180 px tall banner on a 3x wide screen needs far less. */
export const COVER_MAX_SIDE = 2400;

/** Largest picked file the browser tries to prepare (50 MB): bigger ones are refused before decoding. */
export const COVER_SOURCE_MAX_BYTES = 52_428_800;

/** JPEG quality for a prepared cover, then the fallbacks tried while it is still over the cap. */
export const coverJpegQualities = [0.84, 0.72, 0.6] as const;

const sourceTypes: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif"]);
const heicName = /\.(heic|heif)$/i;
/** Types that may carry transparency. JPEG never does. */
const alphaTypes: ReadonlySet<string> = new Set(["image/png", "image/gif", "image/webp", "image/avif"]);

/** What the picker accepts: the cover image types, plus HEIC photos, which some browsers can open. */
export const COVER_SOURCE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,image/heif,.heic,.heif";

/** True when the picked file is a HEIC or HEIF photo (by type, or by name when the browser gives no type). */
export function isHeic(file: { type: string; name: string }): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || (file.type === "" && heicName.test(file.name));
}

/**
 * Why a picked file cannot be prepared as a cover, written for the person
 * who picked it, or null when the browser should try.
 */
export function coverSourceProblem(file: { type: string; name: string; size: number }): string | null {
  if (!sourceTypes.has(file.type) && !isHeic(file)) return "That file cannot be a cover. Pick a photo or image: JPEG, PNG, GIF, WebP, AVIF, or HEIC.";
  if (file.size === 0) return "That file is empty. Pick another image.";
  if (file.size > COVER_SOURCE_MAX_BYTES) return "That image is too large to prepare. Pick one under 50 MB.";
  return null;
}

/** The size to draw an image at: scaled down so its longest side is at most `maxSide`, never scaled up. */
export function coverTargetSize(width: number, height: number, maxSide: number = COVER_MAX_SIDE): { width: number; height: number } {
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
 * The type to encode a prepared cover as. PNG only for an image with
 * transparency that was already within the cap (a JPEG would fill it in);
 * everything else, including every photo, becomes a JPEG.
 */
export function coverOutputType(source: { size: number }, hasAlpha: boolean): "image/png" | "image/jpeg" {
  return hasAlpha && source.size <= COVER_MAX_BYTES ? "image/png" : "image/jpeg";
}

/** True when RGBA pixel data has any pixel that is not fully opaque. */
export function hasTransparentPixel(rgba: ArrayLike<number>): boolean {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 255) return true;
  }
  return false;
}

/** The prepared file's name: the picked name with the new type's extension. */
export function preparedFilename(name: string, type: "image/png" | "image/jpeg"): string {
  const base = name.replace(/\.[^./\\]*$/, "").trim() || "cover";
  return `${base}.${type === "image/png" ? "png" : "jpg"}`;
}
