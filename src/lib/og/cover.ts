import { parseArtifactCover } from "@/lib/covers/cover";
import { coverGradientHex } from "@/lib/covers/gradients";
import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";
import { findReadableFile, signedFileUrl } from "@/lib/files/download";
import { formatHex, parseColor } from "@/lib/themes/color";
import type { Theme } from "@/lib/themes/schema";

/*
 * Covers in artifact link previews. The cover becomes the card's backdrop: a
 * gradient is drawn in the theme's light palette as plain hex (Satori reads
 * no custom properties), with the text in the theme's ink; an image cover is
 * drawn when the preview renderer can decode it (PNG or JPEG) and a
 * signed-out reader may open the file, under a dark scrim so the light text
 * stays readable. Anything else keeps the standard backdrop.
 */

/** What a preview draws behind its text. */
export type OgCover =
  | { type: "gradient"; angle: number; from: string; to: string; ink: string; muted: string }
  | { type: "image"; src: string; position: number };

/** Image types the preview renderer decodes. It draws nothing for WebP, GIF, or AVIF, so those keep the standard backdrop. */
const drawableTypes: ReadonlySet<string> = new Set(["image/png", "image/jpeg"]);

/** How long the preview waits for a cover image before it keeps the standard backdrop. */
const IMAGE_TIMEOUT_MS = 4000;

/** True when the preview can draw this file as a cover: a PNG or JPEG within the cover size cap. */
export function isDrawableCoverImage(file: { contentType: string; size: number }): boolean {
  return drawableTypes.has(file.contentType) && file.size > 0 && file.size <= COVER_MAX_BYTES;
}

/** A gradient cover in the theme's light palette, or null for no cover, an image cover, or a color that does not parse. */
export function ogGradientCover(cover: string | null, theme: Theme): OgCover | null {
  const parsed = parseArtifactCover(cover);
  if (parsed?.type !== "gradient") return null;
  const colors = coverGradientHex(parsed.gradient, theme.light);
  const ink = parseColor(theme.light.foreground);
  const muted = parseColor(theme.light.mutedForeground);
  if (!colors || !ink || !muted) return null;
  return { type: "gradient", ...colors, ink: formatHex(ink), muted: formatHex(muted) };
}

type ImageResult = { src: string } | "skip" | "failed";

async function imageDataUrl(fileId: string): Promise<ImageResult> {
  // The signed-out read check: the file must belong to the approved version a stranger may open.
  const file = await findReadableFile(fileId, null);
  if (!file || !isDrawableCoverImage(file)) return "skip";
  const { url } = await signedFileUrl(file);
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!response.ok) return "failed";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > COVER_MAX_BYTES) return "skip";
  return { src: `data:${file.contentType};base64,${bytes.toString("base64")}` };
}

/**
 * The cover a preview draws for the approved version. `degraded` is true
 * when an image cover could not be fetched this time, so the route caches
 * that picture only briefly and tries again later. A cover the renderer can
 * never draw (WebP, GIF, AVIF, or not readable signed out) keeps the
 * standard backdrop for good. Never throws.
 */
export async function loadOgCover(cover: string | null, theme: Theme): Promise<{ cover: OgCover | null; degraded: boolean }> {
  const parsed = parseArtifactCover(cover);
  if (parsed?.type !== "image") return { cover: ogGradientCover(cover, theme), degraded: false };
  try {
    const result = await imageDataUrl(parsed.fileId);
    if (typeof result === "object") return { cover: { type: "image", src: result.src, position: parsed.position }, degraded: false };
    return { cover: null, degraded: result === "failed" };
  } catch (error) {
    console.error("[og] Cover image could not be drawn; keeping the standard backdrop", error instanceof Error ? error.name : "unknown error");
    return { cover: null, degraded: true };
  }
}
