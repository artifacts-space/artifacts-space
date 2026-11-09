import { binaryMegabytes } from "@/lib/format-bytes";
import {
  hasTransparentPixel,
  imageJpegQualities,
  imageOutputType,
  imageTargetSize,
  isHeic,
  mayHaveAlpha,
  preparedFilename,
  type ImagePrepareProfile,
} from "@/lib/images/prepare-rules";

/**
 * Prepares a picked image as a cover or an icon in the browser: decoded
 * upright (camera orientation applied), scaled so its longest side fits the
 * profile (2400 px for covers, 512 px for icons), and re-encoded as a JPEG
 * (or a PNG that keeps its transparency when it fits the cap). Drawing it
 * fresh drops the camera metadata, so no GPS position ends up in a page.
 * The rules live in src/lib/images/prepare-rules.ts; the server still checks
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
export interface ImageSurface {
  /** Draws the image over the whole surface, on an opaque white fill when `opaque` (a JPEG has no transparency). */
  draw: (image: DecodedImage, opaque: boolean) => void;
  /** The drawn RGBA pixels. */
  pixels: () => ArrayLike<number>;
  /** Encodes what is drawn, or resolves null when the browser cannot. */
  encode: (type: "image/png" | "image/jpeg", quality?: number) => Promise<Blob | null>;
}

/** What preparing needs from the browser; tests pass a fake. */
export interface ImageEnv {
  /** Decodes the file upright, or rejects when the browser cannot read it. */
  decode: (file: Blob) => Promise<DecodedImage>;
  surface: (width: number, height: number) => ImageSurface;
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

function canvasSurface(width: number, height: number): ImageSurface {
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
export const browserImageEnv: ImageEnv = {
  decode: (file) => decodeWithBitmap(file).catch(() => decodeWithElement(file)),
  surface: canvasSurface,
};

interface Encoded {
  blob: Blob;
  type: "image/png" | "image/jpeg";
}

/** The encoded image within `maxBytes`, or null when every attempt is still over it. A PNG that does not fit falls back to JPEG. */
async function encodeWithin(surface: ImageSurface, image: DecodedImage, type: "image/png" | "image/jpeg", maxBytes: number): Promise<Encoded | null> {
  if (type === "image/png") {
    const png = await surface.encode("image/png");
    if (png?.type === "image/png" && png.size <= maxBytes) return { blob: png, type };
    surface.draw(image, true);
  }
  for (const quality of imageJpegQualities) {
    const jpeg = await surface.encode("image/jpeg", quality);
    if (jpeg?.type === "image/jpeg" && jpeg.size <= maxBytes) return { blob: jpeg, type: "image/jpeg" };
  }
  return null;
}

async function decodeOrExplain(file: File, env: ImageEnv): Promise<DecodedImage> {
  try {
    return await env.decode(file);
  } catch {
    throw new Error(isHeic(file) ? "This browser cannot open HEIC photos. Save the photo as a JPEG, or upload it from your phone, and try again." : "That image could not be opened. Try another file.");
  }
}

/**
 * Prepares one picked image for upload as `profile` describes (a cover or an
 * icon) and returns the new file, or throws an Error whose message is
 * written for people.
 */
export async function prepareImage(file: File, profile: ImagePrepareProfile, env: ImageEnv = browserImageEnv): Promise<File> {
  const image = await decodeOrExplain(file, env);
  try {
    const size = imageTargetSize(image.width, image.height, profile.maxSide);
    const surface = env.surface(size.width, size.height);
    const checkAlpha = mayHaveAlpha(file.type) && file.size <= profile.alphaSourceMaxBytes;
    surface.draw(image, !checkAlpha);
    const hasAlpha = checkAlpha && hasTransparentPixel(surface.pixels());
    const encoded = await encodeWithin(surface, image, imageOutputType(file, hasAlpha, profile), profile.maxBytes);
    if (!encoded) throw new Error(`That image is still over ${binaryMegabytes(profile.maxBytes)} after resizing. Try a smaller image.`);
    return new File([encoded.blob], preparedFilename(file.name, encoded.type, profile.use), { type: encoded.type });
  } finally {
    image.close();
  }
}
