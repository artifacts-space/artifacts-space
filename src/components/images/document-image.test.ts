import { describe, expect, it, vi } from "vitest";

import { exifTag, jpegBytes, pngAcTL, pngBytes, pngChunk, pngFcTL, webpAnim, webpBytes, webpFrame } from "@/lib/images/image-bytes-harness";
import { documentPrepareProfile } from "@/lib/images/prepare-rules";

import { documentImageToSend } from "./document-image";
import type { DecodedImage, ImageEnv } from "./prepare-image";

/*
 * What an image put into a document uploads as, with the canvas faked:
 * decoding returns the size the browser would draw, and a redraw returns a
 * JPEG or PNG of a fixed size, so a test tells a redrawn file from the
 * picked one by its bytes.
 */

function fakeEnv(drawn: { width: number; height: number } | null) {
  const close = vi.fn();
  const decode = vi.fn<ImageEnv["decode"]>(() => {
    if (!drawn) return Promise.reject(new Error("decode"));
    const image: DecodedImage = { ...drawn, source: {} as CanvasImageSource, close };
    return Promise.resolve(image);
  });
  const env: ImageEnv = {
    decode,
    surface: () => ({
      draw: () => undefined,
      pixels: () => [0, 0, 0, 255],
      encode: (type) => Promise.resolve(new Blob([new Uint8Array(1234)], { type })),
    }),
  };
  return { env, decode, close };
}

const fileOf = (bytes: Uint8Array, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });
const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

describe("documentImageToSend", () => {
  it("should send a small screenshot with its own bytes, type, and name", async () => {
    const picked = fileOf(pngBytes({ width: 1280, height: 800 }), "Screenshot.png", "image/png");
    const { env, close } = fakeEnv({ width: 1280, height: 800 });
    const choice = await documentImageToSend(picked, env);
    expect(choice.file).toBe(picked);
    expect(choice.redraw).not.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it("should send a small JPEG turned by its camera orientation with its own bytes, when the browser draws it the way it is stored", async () => {
    const picked = fileOf(jpegBytes({ width: 640, height: 480, exif: { orientation: 6 } }), "IMG_2041.jpg", "image/jpeg");
    const choice = await documentImageToSend(picked, fakeEnv({ width: 480, height: 640 }).env);
    expect(choice.file).toBe(picked);
  });

  it("should redraw a small photo that has a location, and never decode it to measure", async () => {
    const picked = fileOf(jpegBytes({ width: 640, height: 480, exif: { gps: true } }), "IMG_2042.jpg", "image/jpeg");
    const { env, decode } = fakeEnv({ width: 640, height: 480 });
    const choice = await documentImageToSend(picked, env);
    expect(choice.file).not.toBe(picked);
    expect(choice.file.type).toBe("image/jpeg");
    expect(await bytesOf(choice.file)).not.toEqual(await bytesOf(picked));
    expect(choice.redraw).toBeNull();
    expect(decode).toHaveBeenCalledOnce();
  });

  it("should redraw a small photo with an embedded thumbnail, a serial number, or an artist", async () => {
    for (const exif of [{ thumbnail: true }, { exif: [exifTag.bodySerial] }, { first: [exifTag.artist] }]) {
      const picked = fileOf(jpegBytes({ width: 640, height: 480, exif }), "IMG_2044.jpg", "image/jpeg");
      const choice = await documentImageToSend(picked, fakeEnv({ width: 640, height: 480 }).env);
      expect(choice.file, JSON.stringify(exif)).not.toBe(picked);
    }
  });

  it("should send a small photo that keeps only its make, model, time, settings, and software with its own bytes", async () => {
    const exif = { first: [exifTag.make, exifTag.software, exifTag.dateTime], exif: [exifTag.exposureTime, exifTag.userComment] };
    const picked = fileOf(jpegBytes({ width: 640, height: 480, exif }), "IMG_2045.jpg", "image/jpeg");
    expect((await documentImageToSend(picked, fakeEnv({ width: 640, height: 480 }).env)).file).toBe(picked);
  });

  it("should redraw a large still image, decoding it once", async () => {
    const picked = fileOf(jpegBytes({ width: 4032, height: 3024 }), "IMG_2043.jpg", "image/jpeg");
    const { env, decode, close } = fakeEnv({ width: 4032, height: 3024 });
    const choice = await documentImageToSend(picked, env);
    expect(choice.file).not.toBe(picked);
    expect(choice.redraw).toBeNull();
    expect(decode).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("should redraw a small image whose header says another size than the browser draws", async () => {
    const picked = fileOf(pngBytes({ width: 100, height: 100 }), "Lies.png", "image/png");
    const choice = await documentImageToSend(picked, fakeEnv({ width: 3000, height: 3000 }).env);
    expect(choice.file).not.toBe(picked);
  });

  it("should send an animated image as it is, as before", async () => {
    const animated = fileOf(pngBytes({ chunks: [pngAcTL(2), pngFcTL(), pngFcTL()] }), "Loop.png", "image/png");
    const { env, decode } = fakeEnv({ width: 320, height: 200 });
    await expect(documentImageToSend(animated, env)).resolves.toEqual({ file: animated, redraw: null });
    const gif = fileOf(new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0]), "Wave.gif", "image/gif");
    await expect(documentImageToSend(gif, env)).resolves.toEqual({ file: gif, redraw: null });
    expect(decode).not.toHaveBeenCalled();
  });

  it("should send a two-frame animated WebP as it is, as before", async () => {
    const animated = fileOf(webpBytes({ flags: 0x02, chunks: [webpAnim(), webpFrame(), webpFrame()] }), "Loop.webp", "image/webp");
    const { env, decode } = fakeEnv({ width: 320, height: 200 });
    await expect(documentImageToSend(animated, env)).resolves.toEqual({ file: animated, redraw: null });
    expect(decode).not.toHaveBeenCalled();
  });

  it("should treat a one-frame APNG or animated WebP as a still: checked, measured, and kept when small and plain", async () => {
    const stills = [
      fileOf(pngBytes({ chunks: [pngAcTL(1), pngFcTL()] }), "One.png", "image/png"),
      fileOf(webpBytes({ flags: 0x02, chunks: [webpAnim(), webpFrame()] }), "One.webp", "image/webp"),
    ];
    for (const still of stills) {
      const { env, decode } = fakeEnv({ width: 320, height: 200 });
      const choice = await documentImageToSend(still, env);
      expect(choice.file, still.name).toBe(still);
      expect(choice.redraw, still.name).not.toBeNull();
      expect(decode, still.name).toHaveBeenCalledOnce();
    }
  });

  it("should redraw a one-frame APNG that carries private data, which a redraw keeps all of the picture of", async () => {
    const still = fileOf(pngBytes({ chunks: [pngAcTL(1), pngFcTL(), pngChunk("tEXt", [...Array.from("Author\0", (letter) => letter.charCodeAt(0)), 74])] }), "One.png", "image/png");
    expect((await documentImageToSend(still, fakeEnv({ width: 320, height: 200 }).env)).file).not.toBe(still);
  });

  it("should redraw an image whose private data cannot be told: a type the check cannot read, or bytes it cannot parse", async () => {
    const avif = fileOf(new Uint8Array([0, 0, 0, 0x14, 102, 116, 121, 112, 97, 118, 105, 102]), "Photo.avif", "image/avif");
    const avifChoice = await documentImageToSend(avif, fakeEnv({ width: 320, height: 200 }).env);
    expect(avifChoice.file).not.toBe(avif);
    expect(avifChoice.file.type).toBe("image/jpeg");
    const trailing = fileOf(new Uint8Array([...webpBytes(), 0, 0]), "Odd.webp", "image/webp");
    expect((await documentImageToSend(trailing, fakeEnv({ width: 320, height: 200 }).env)).file).not.toBe(trailing);
  });

  it("should redraw a small image too big to send as it is", async () => {
    const big = new Uint8Array(documentPrepareProfile.maxBytes + 1);
    big.set(pngBytes({ width: 2000, height: 1000 }));
    const picked = fileOf(big, "Huge.png", "image/png");
    const choice = await documentImageToSend(picked, fakeEnv({ width: 2000, height: 1000 }).env);
    expect(choice.file).not.toBe(picked);
    expect(choice.file.size).toBe(1234);
  });

  it("should offer a redraw of an image sent as it is, for when the upload is refused", async () => {
    const picked = fileOf(pngBytes(), "Small.png", "image/png");
    const choice = await documentImageToSend(picked, fakeEnv({ width: 320, height: 200 }).env);
    const redrawn = await choice.redraw?.();
    expect(redrawn?.type).toBe("image/png");
    expect(redrawn?.size).toBe(1234);
  });

  it("should say why when an image that must be redrawn cannot be opened", async () => {
    const picked = fileOf(jpegBytes({ exif: { gps: true } }), "Broken.jpg", "image/jpeg");
    await expect(documentImageToSend(picked, fakeEnv(null).env)).rejects.toThrow("That image could not be opened");
  });
});
