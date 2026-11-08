import { describe, expect, it, vi } from "vitest";

import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";
import { ICON_MAX_BYTES } from "@/lib/files/icon-rules";
import { coverPrepareProfile, iconPrepareProfile } from "@/lib/images/prepare-rules";

import { prepareImage, type DecodedImage, type ImageEnv } from "./prepare-image";

const prepareCoverImage = (file: File, env: ImageEnv) => prepareImage(file, coverPrepareProfile, env);
const prepareIconImage = (file: File, env: ImageEnv) => prepareImage(file, iconPrepareProfile, env);

/*
 * Preparing a cover or an icon in the browser, with the canvas faked: decoding returns
 * a sized image, and encoding returns a blob of a chosen size per type and
 * quality, so the size, type, and fallback decisions are tested without one.
 */

interface FakeOptions {
  width?: number;
  height?: number;
  transparent?: boolean;
  decodeFails?: boolean;
  /** Bytes the encoder produces for a type and quality. */
  bytes?: (type: string, quality?: number) => number;
}

function fakeEnv(options: FakeOptions = {}) {
  const close = vi.fn();
  const draws: { width: number; height: number; opaque: boolean }[] = [];
  const encodes: { type: string; quality: number | undefined }[] = [];
  const image: DecodedImage = { width: options.width ?? 4032, height: options.height ?? 3024, source: {} as CanvasImageSource, close };
  const env: ImageEnv = {
    decode: () => (options.decodeFails ? Promise.reject(new Error("decode")) : Promise.resolve(image)),
    surface: (width, height) => ({
      draw: (_image, opaque) => { draws.push({ width, height, opaque }); },
      pixels: () => [0, 0, 0, options.transparent ? 0 : 255],
      encode: (type, quality) => {
        encodes.push({ type, quality });
        const size = options.bytes?.(type, quality) ?? 400_000;
        return Promise.resolve(new Blob([new Uint8Array(size)], { type }));
      },
    }),
  };
  return { env, close, draws, encodes };
}

function photo(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("prepareImage for covers", () => {
  it("should scale a large phone photo to 2400 px and re-encode it as a JPEG under the cap", async () => {
    const { env, draws, encodes, close } = fakeEnv();
    const prepared = await prepareCoverImage(photo("IMG_0001.JPG", "image/jpeg", 6_000_000), env);
    expect(prepared).toMatchObject({ name: "IMG_0001.jpg", type: "image/jpeg" });
    expect(prepared.size).toBeLessThanOrEqual(COVER_MAX_BYTES);
    expect(draws[0]).toEqual({ width: 2400, height: 1800, opaque: true });
    expect(encodes).toEqual([{ type: "image/jpeg", quality: 0.84 }]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("should re-encode a small JPEG too, so camera metadata never reaches the upload", async () => {
    const { env, draws } = fakeEnv({ width: 1200, height: 800 });
    const prepared = await prepareCoverImage(photo("small.jpeg", "image/jpeg", 300_000), env);
    expect(prepared.type).toBe("image/jpeg");
    expect(draws[0]).toMatchObject({ width: 1200, height: 800 });
  });

  it("should turn WebP, GIF, and AVIF into JPEG so link previews can draw them", async () => {
    for (const [name, type] of [["a.webp", "image/webp"], ["b.gif", "image/gif"], ["c.avif", "image/avif"]] as const) {
      const { env } = fakeEnv();
      await expect(prepareCoverImage(photo(name, type, 500_000), env)).resolves.toMatchObject({ type: "image/jpeg" });
    }
  });

  it("should keep a PNG with transparency as a PNG when it already fit the cap", async () => {
    const { env, draws } = fakeEnv({ width: 1600, height: 500, transparent: true });
    const prepared = await prepareCoverImage(photo("logo.png", "image/png", 800_000), env);
    expect(prepared).toMatchObject({ name: "logo.png", type: "image/png" });
    expect(draws).toEqual([{ width: 1600, height: 500, opaque: false }]);
  });

  it("should use JPEG for an opaque PNG", async () => {
    const { env } = fakeEnv({ transparent: false });
    await expect(prepareCoverImage(photo("shot.png", "image/png", 800_000), env)).resolves.toMatchObject({ name: "shot.jpg", type: "image/jpeg" });
  });

  it("should fall back to JPEG on an opaque fill when the transparent PNG comes out over the cap", async () => {
    const { env, draws } = fakeEnv({ transparent: true, bytes: (type) => (type === "image/png" ? COVER_MAX_BYTES + 1 : 500_000) });
    const prepared = await prepareCoverImage(photo("big.png", "image/png", 1_500_000), env);
    expect(prepared.type).toBe("image/jpeg");
    expect(draws.at(-1)?.opaque).toBe(true);
  });

  it("should lower the JPEG quality step by step when the first try is still over the cap", async () => {
    const { env, encodes } = fakeEnv({ bytes: (_type, quality) => ((quality ?? 1) > 0.65 ? COVER_MAX_BYTES + 1 : 1_900_000) });
    const prepared = await prepareCoverImage(photo("noisy.jpg", "image/jpeg", 12_000_000), env);
    expect(prepared.size).toBe(1_900_000);
    expect(encodes.map((entry) => entry.quality)).toEqual([0.84, 0.72, 0.6]);
  });

  it("should refuse with a message when even the lowest quality is over the cap", async () => {
    const { env, close } = fakeEnv({ bytes: () => COVER_MAX_BYTES + 1 });
    await expect(prepareCoverImage(photo("huge.jpg", "image/jpeg", 20_000_000), env)).rejects.toThrow(/still over 2 MB/);
    expect(close).toHaveBeenCalledOnce();
  });

  it("should explain HEIC when the browser cannot open the photo", async () => {
    const { env } = fakeEnv({ decodeFails: true });
    await expect(prepareCoverImage(photo("IMG_0002.HEIC", "image/heic", 3_000_000), env)).rejects.toThrow(/cannot open HEIC photos/);
    await expect(prepareCoverImage(photo("broken.jpg", "image/jpeg", 3_000), env)).rejects.toThrow(/could not be opened/);
  });
});

describe("prepareImage for icons", () => {
  it("should scale a phone photo to 512 px and re-encode it as a JPEG under the 1 MB icon cap", async () => {
    const { env, draws, close } = fakeEnv();
    const prepared = await prepareIconImage(photo("IMG_0003.JPG", "image/jpeg", 5_000_000), env);
    expect(prepared).toMatchObject({ name: "IMG_0003.jpg", type: "image/jpeg" });
    expect(prepared.size).toBeLessThanOrEqual(ICON_MAX_BYTES);
    expect(draws[0]).toEqual({ width: 512, height: 384, opaque: true });
    expect(close).toHaveBeenCalledOnce();
  });

  it("should keep a transparent logo as a PNG when it fits 1 MB, even when the picked file was larger", async () => {
    const { env, draws } = fakeEnv({ width: 2000, height: 2000, transparent: true });
    const prepared = await prepareIconImage(photo("logo.png", "image/png", 3_000_000), env);
    expect(prepared).toMatchObject({ name: "logo.png", type: "image/png" });
    expect(draws[0]).toEqual({ width: 512, height: 512, opaque: false });
  });

  it("should fall back to JPEG when the transparent PNG comes out over the icon cap", async () => {
    const { env } = fakeEnv({ transparent: true, bytes: (type) => (type === "image/png" ? ICON_MAX_BYTES + 1 : 80_000) });
    await expect(prepareIconImage(photo("noisy.png", "image/png", 900_000), env)).resolves.toMatchObject({ type: "image/jpeg" });
  });

  it("should refuse with the icon cap in the message when even the lowest quality is over it", async () => {
    const { env } = fakeEnv({ bytes: () => ICON_MAX_BYTES + 1 });
    await expect(prepareIconImage(photo("huge.jpg", "image/jpeg", 20_000_000), env)).rejects.toThrow(/still over 1 MB/);
  });
});
