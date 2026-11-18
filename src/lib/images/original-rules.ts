import type { ImageDimensions } from "@/lib/files/image-dimensions";

import type { LocationFinding } from "./location-rules";
import type { ImagePrepareProfile } from "./prepare-rules";

/**
 * When a still image goes into a document with its own bytes instead of
 * being redrawn (decided by the owner on 17 Nov 2026: "there is no need to
 * redraw small images"). Small means its longest side, as the browser draws
 * it, fits the profile's `maxSide`. A small image that says where it was
 * taken, or that the check cannot read for certain, is still redrawn: the
 * redraw is what drops the place a photo was taken, and these images land
 * on shared and public pages. Pure; src/components/images/document-image.ts
 * gathers the facts.
 */

/** Types a still image may keep its bytes in: the ones the location check reads (location-rules.ts). AVIF, HEIC, and the rest are always redrawn. */
export const originalStillTypes: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/** What the browser knows about a picked still image before it chooses. */
export interface StillImageFacts {
  /** The file's declared type, which the upload declares too. */
  type: string;
  /** The file's size in bytes. */
  size: number;
  /** What the file's bytes say about where it was taken. */
  location: LocationFinding;
  /** The size the browser decoded it at, upright, or null when it could not decode it. */
  drawn: ImageDimensions | null;
  /** The size the server will store for it (readImageDimensions on the same first bytes), or null when it reads none. */
  stated: ImageDimensions | null;
}

/** True when a file of this type and size is worth checking at all: a type that can keep its bytes, not empty, within the profile's cap. */
export function mayKeepOriginal(file: { type: string; size: number }, profile: ImagePrepareProfile): boolean {
  return originalStillTypes.has(file.type) && file.size > 0 && file.size <= profile.maxBytes;
}

const sameSize = (one: ImageDimensions, other: ImageDimensions) => one.width === other.width && one.height === other.height;

/**
 * True when the still image uploads with its own bytes: a type and size
 * that may (`mayKeepOriginal`), positively no location, decoded by the
 * browser with its longest side within `maxSide`, and a size the server will
 * store that is the one the browser draws (so a JPEG turned by its camera
 * orientation keeps its place the right way round). Anything else is
 * redrawn, as before.
 */
export function keepsOriginal(facts: StillImageFacts, profile: ImagePrepareProfile): boolean {
  if (!mayKeepOriginal(facts, profile) || facts.location !== "none") return false;
  const { drawn, stated } = facts;
  if (!drawn || !stated) return false;
  return Math.max(drawn.width, drawn.height) <= profile.maxSide && sameSize(drawn, stated);
}
