import type { ImageDimensions } from "@/lib/files/image-dimensions";

import { privateDataCheckedTypes, type PrivateDataFinding } from "./private-data-rules";
import type { ImagePrepareProfile } from "./prepare-rules";

/**
 * When a still image goes into a document with its own bytes instead of
 * being redrawn (decided by the owner on 17 Nov 2026: "there is no need to
 * redraw small images"). Small means its longest side, as the browser draws
 * it, fits the profile's `maxSide`. A small image that carries private
 * data (where it was taken, who took it, the serial of the one device that
 * did, or an embedded preview, which can show the frame before a crop), or
 * that the check cannot read for certain, is still redrawn
 * (private-data-rules.ts): the redraw is what drops those tags, and these
 * images land on shared and public pages. An image sent as it is keeps its
 * camera make and model, the time taken, exposure settings, the editing
 * software, and its color profile. Pure;
 * src/components/images/document-image.ts gathers the facts.
 */

/** Types a still image may keep its bytes in: the ones the private data check reads (private-data-rules.ts). AVIF, HEIC, and the rest are always redrawn. */
export const originalStillTypes: ReadonlySet<string> = privateDataCheckedTypes;

/** What the browser knows about a picked still image before it chooses. */
export interface StillImageFacts {
  /** The file's declared type, which the upload declares too. */
  type: string;
  /** The file's size in bytes. */
  size: number;
  /** What the file's bytes say about a place, a person, one device, or a preview. */
  privateData: PrivateDataFinding;
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
 * that may (`mayKeepOriginal`), positively no private data, decoded by the
 * browser with its longest side within `maxSide`, and a size the server will
 * store that is the one the browser draws (so a JPEG turned by its camera
 * orientation keeps its place the right way round). Anything else is
 * redrawn, as before.
 */
export function keepsOriginal(facts: StillImageFacts, profile: ImagePrepareProfile): boolean {
  if (!mayKeepOriginal(facts, profile) || facts.privateData !== "none") return false;
  const { drawn, stated } = facts;
  if (!drawn || !stated) return false;
  return Math.max(drawn.width, drawn.height) <= profile.maxSide && sameSize(drawn, stated);
}
