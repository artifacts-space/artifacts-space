import { imageDimensionBytes, readImageDimensions } from "@/lib/files/image-dimensions";
import { keepsOriginal, mayKeepOriginal } from "@/lib/images/original-rules";
import { findPrivateData } from "@/lib/images/private-data-rules";
import { documentPrepareProfile, isAnimatedImage, uploadsUnprepared } from "@/lib/images/prepare-rules";

import { browserImageEnv, prepareImage, type DecodedImage, type ImageEnv } from "./prepare-image";

/**
 * What an image put into a document uploads as. A GIF within the cap
 * (`uploadsUnprepared`), and a WebP or PNG with more than one frame
 * (`isAnimatedImage`), go as they are: a redraw would keep one frame. A still image whose
 * longest side, decoded by the browser, is at most 2400 px goes with its own
 * bytes, unchanged, when its bytes positively hold no private data: no
 * place, no person, no device serial, no embedded preview
 * (private-data-rules.ts, original-rules.ts). Every other still image is
 * redrawn as before (prepare-image.ts): upright, at most 2400 px, camera
 * data dropped.
 */

/** The file to send, and for one sent with its own bytes, how to redraw it instead when the upload is refused. */
export interface DocumentImageChoice {
  file: File;
  redraw: (() => Promise<File>) | null;
}

const profile = documentPrepareProfile;

/** The whole file's bytes, or null when the browser cannot read it. Only called for files within the cap. */
async function bytesOrNull(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function decodedOrNull(file: File, env: ImageEnv): Promise<DecodedImage | null> {
  try {
    return await env.decode(file);
  } catch {
    return null;
  }
}

/** Redraws `file`, from the image already decoded when there is one. */
function redrawn(file: File, env: ImageEnv, decoded: DecodedImage | null = null): Promise<File> {
  return prepareImage(file, profile, decoded ? { ...env, decode: () => Promise.resolve(decoded) } : env);
}

/** A still image that may keep its bytes: checked for private data, decoded, and compared. */
async function checkedStill(file: File, bytes: Uint8Array, env: ImageEnv): Promise<DocumentImageChoice> {
  const privateData = findPrivateData(file.type, bytes);
  if (privateData !== "none") return { file: await redrawn(file, env), redraw: null };
  const decoded = await decodedOrNull(file, env);
  const drawn = decoded ? { width: decoded.width, height: decoded.height } : null;
  const stated = readImageDimensions(file.type, bytes.subarray(0, imageDimensionBytes));
  if (!keepsOriginal({ type: file.type, size: file.size, privateData, drawn, stated }, profile)) return { file: await redrawn(file, env, decoded), redraw: null };
  decoded?.close();
  return { file, redraw: () => redrawn(file, env) };
}

/**
 * Chooses what a picked image uploads as in a document (see above), or
 * throws an Error written for people when a redraw cannot open or fit it.
 * `env` is the browser's; tests pass a fake.
 */
export async function documentImageToSend(file: File, env: ImageEnv = browserImageEnv): Promise<DocumentImageChoice> {
  if (uploadsUnprepared(file, profile)) return { file, redraw: null };
  const bytes = file.size <= profile.maxBytes ? await bytesOrNull(file) : null;
  if (bytes && isAnimatedImage(file.type, bytes)) return { file, redraw: null };
  if (!bytes || !mayKeepOriginal(file, profile)) return { file: await redrawn(file, env), redraw: null };
  return checkedStill(file, bytes, env);
}
