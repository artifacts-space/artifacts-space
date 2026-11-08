import { coverJpegQualities, coverOutputType, coverTargetSize, hasTransparentPixel, isHeic, mayHaveAlpha, preparedFilename } from "@/lib/covers/prepare-rules";
import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";

/**
 * Prepares a picked image as a cover in the browser: decoded upright (camera
 * orientation applied), scaled so its longest side is at most 2400 px, and
 * re-encoded as a JPEG (or a PNG with transparency that already fit). Drawing
 * it fresh drops the camera metadata, so no GPS position ends up in a cover.
 * The rules live in src/lib/covers/prepare-rules.ts; the server still checks
 * the result like any upload.
 */

/** A decoded image, upright, ready to draw. */
export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
}

/** A drawing surface of a fixed size. */
export interface CoverSurface {
  /** Draws the image over the whole surface, on an opaque white fill when `opaque` (a JPEG has no transparency). */
  draw: (image: DecodedImage, opaque: boolean) => void;
  /** The drawn RGBA pixels. */
  pixels: () => ArrayLike<number>;
  /** Encodes what is drawn, or resolves null when the browser cannot. */
  encode: (type: "image/png" | "image/jpeg", quality?: number) => Promise<Blob | null>;
}

/** What preparing needs from the browser; tests pass a fake. */
export interface CoverImageEnv {
  /** Decodes the file upright, or rejects when the browser cannot read it. */
  decode: (file: Blob) => Promise<DecodedImage>;
  surface: (width: number, height: number) => CoverSurface;
}

async function decodeWithBitmap(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => { bitmap.close(); } };
}

/** The fallback for browsers whose createImageBitmap cannot read a format their image element can (such as HEIC in Safari). Image elements apply the camera orientation. */
async function decodeWithElement(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => { URL.revokeObjectURL(url); } };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasSurface(width: number, height: number): CoverSurface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare images. Try another browser.");
  return {
    draw(image, opaque) {
      context.clearRect(0, 0, width, height);
      if (opaque) {
        // A canvas pixel value, not a page color: transparent areas become white in a JPEG instead of black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.source, 0, 0, width, height);
    },
    pixels: () => context.getImageData(0, 0, width, height).data,
    encode: (type, quality) => new Promise((resolve) => { canvas.toBlob(resolve, type, quality); }),
  };
}

/** The real browser environment. */
export const browserCoverImageEnv: CoverImageEnv = {
  decode: (file) => decodeWithBitmap(file).catch(() => decodeWithElement(file)),
  surface: canvasSurface,
};

interface Encoded {
  blob: Blob;
  type: "image/png" | "image/jpeg";
}

/** The encoded cover within the cap, or null when every attempt is still over it. A PNG that does not fit falls back to JPEG. */
async function encodeWithin(surface: CoverSurface, image: DecodedImage, type: "image/png" | "image/jpeg"): Promise<Encoded | null> {
  if (type === "image/png") {
    const png = await surface.encode("image/png");
    if (png?.type === "image/png" && png.size <= COVER_MAX_BYTES) return { blob: png, type };
    surface.draw(image, true);
  }
  for (const quality of coverJpegQualities) {
    const jpeg = await surface.encode("image/jpeg", quality);
    if (jpeg?.type === "image/jpeg" && jpeg.size <= COVER_MAX_BYTES) return { blob: jpeg, type: "image/jpeg" };
  }
  return null;
}

async function decodeOrExplain(file: File, env: CoverImageEnv): Promise<DecodedImage> {
  try {
    return await env.decode(file);
  } catch {
    throw new Error(isHeic(file) ? "This browser cannot open HEIC photos. Save the photo as a JPEG, or upload it from your phone, and try again." : "That image could not be opened. Try another file.");
  }
}

/**
 * Prepares one picked image as a cover upload and returns the new file, or
 * throws an Error whose message is written for people.
 */
export async function prepareCoverImage(file: File, env: CoverImageEnv = browserCoverImageEnv): Promise<File> {
  const image = await decodeOrExplain(file, env);
  try {
    const size = coverTargetSize(image.width, image.height);
    const surface = env.surface(size.width, size.height);
    const checkAlpha = mayHaveAlpha(file.type) && file.size <= COVER_MAX_BYTES;
    surface.draw(image, !checkAlpha);
    const hasAlpha = checkAlpha && hasTransparentPixel(surface.pixels());
    const encoded = await encodeWithin(surface, image, coverOutputType(file, hasAlpha));
    if (!encoded) throw new Error("That image is still over 2 MB after resizing. Try a smaller image.");
    return new File([encoded.blob], preparedFilename(file.name, encoded.type), { type: encoded.type });
  } finally {
    image.close();
  }
}
