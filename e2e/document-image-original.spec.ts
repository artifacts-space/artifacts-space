import type { Page } from "@playwright/test";

import { readImageDimensions } from "../src/lib/files/image-dimensions";
import { findLocation } from "../src/lib/images/location-rules";
import { expect, test } from "./support/test";
import { documentOf, dragFilesAt, media, pointIn, writeDocument } from "./support/workspace-files";

/**
 * A small still image goes into a document with its own bytes, unless it
 * says where it was taken (src/components/images/document-image.ts). Checked
 * on /dev/workspace, whose stand-in keeps each upload in the tab as a data
 * URL (fixture-media.ts), so the test reads the very bytes that were sent.
 */

interface SentFile { filename: string; contentType: string; size: number; url: string }

/** The uploads the stand-in kept, in order. */
const sentFiles = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:media") ?? "[]") as SentFile[]);

const bytesOf = (sent: SentFile) => [...Buffer.from(sent.url.split(",")[1] ?? "", "base64")];

/** A picture drawn in the browser and encoded as `type`, as a screenshot or a photo would be. */
async function drawnImage(page: Page, type: "image/png" | "image/jpeg"): Promise<number[]> {
  return page.evaluate(async (encoding) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const pixel = index / 4;
      pixels.data[index] = pixel % 256;
      pixels.data[index + 1] = Math.floor(pixel / canvas.width) % 256;
      pixels.data[index + 2] = 128;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, encoding, 0.9); });
    if (!blob) throw new Error("No image");
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, type);
}

/** An Exif segment, big-endian, whose first directory holds a camera model and the tag given: the GPS pointer, as a phone photo with its location on has, or a camera orientation. */
function exifSegment(tag: "gps" | "turned"): number[] {
  const be16 = (value: number) => [(value >> 8) & 255, value & 255];
  const be32 = (value: number) => [...be16(value >>> 16), ...be16(value & 0xffff)];
  const entry = (id: number, type: number, value: number[]) => [...be16(id), ...be16(type), ...be32(1), ...value];
  const second = tag === "gps" ? entry(0x8825, 4, be32(0)) : entry(0x0112, 3, [...be16(6), 0, 0]);
  const tiff = [77, 77, ...be16(42), ...be32(8), ...be16(2), ...entry(0x0110, 2, [67, 97, 109, 0]), ...second, ...be32(0)];
  const payload = [69, 120, 105, 102, 0, 0, ...tiff];
  return [0xff, 0xe1, ...be16(payload.length + 2), ...payload];
}

async function dropImage(page: Page, name: string, type: string, bytes: number[]) {
  const point = await pointIn(documentOf(page).getByText("Words.", { exact: true }), 20);
  expect((await dragFilesAt(page, "drop", [{ name, type, bytes }], point)).prevented).toBe(true);
  await expect(media(page)).toHaveCount(1);
  await expect.poll(async () => (await sentFiles(page)).length, { timeout: 15_000 }).toBe(1);
  const [sent] = await sentFiles(page);
  if (!sent) throw new Error("Nothing was sent.");
  return sent;
}

test.describe("a small image dropped on a document", () => {
  test.skip(({ isMobile }) => isMobile, "Files are dragged from a desktop.");

  test("should store a small screenshot with the bytes, size, and type it had", async ({ page }) => {
    await writeDocument(page, "Screenshot", ["Words."]);
    const png = await drawnImage(page, "image/png");
    expect(findLocation("image/png", new Uint8Array(png)), "the browser's own PNG holds no place").toBe("none");
    const sent = await dropImage(page, "Screenshot.png", "image/png", png);
    expect(sent).toMatchObject({ filename: "Screenshot.png", contentType: "image/png", size: png.length });
    expect(bytesOf(sent)).toEqual(png);
  });

  test("should not store a small photo that says where it was taken as it was, and store it without the place", async ({ page }) => {
    await writeDocument(page, "Photo", ["Words."]);
    const drawn = await drawnImage(page, "image/jpeg");
    const photo = [...drawn.slice(0, 2), ...exifSegment("gps"), ...drawn.slice(2)];
    expect(findLocation("image/jpeg", new Uint8Array(photo)), "the dropped photo has its location").toBe("location");
    const sent = await dropImage(page, "IMG_4410.jpg", "image/jpeg", photo);
    expect(sent.contentType).toBe("image/jpeg");
    expect(sent.size).not.toBe(photo.length);
    expect(bytesOf(sent)).not.toEqual(photo);
    expect(findLocation("image/jpeg", new Uint8Array(bytesOf(sent))), "the stored photo has no location").not.toBe("location");
  });

  test("should store a small photo turned by its camera, with no location, as it was, drawn upright", async ({ page }) => {
    await writeDocument(page, "Turned", ["Words."]);
    const drawn = await drawnImage(page, "image/jpeg");
    const photo = [...drawn.slice(0, 2), ...exifSegment("turned"), ...drawn.slice(2)];
    expect(findLocation("image/jpeg", new Uint8Array(photo))).toBe("none");
    const sent = await dropImage(page, "IMG_4411.jpg", "image/jpeg", photo);
    expect(bytesOf(sent)).toEqual(photo);
    // The browser draws it on its side, as the camera said: 400 wide, 640 tall, the size the server stores for it.
    const shown = media(page).locator("img").first();
    await expect.poll(() => shown.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([400, 640]);
    expect(readImageDimensions("image/jpeg", new Uint8Array(photo))).toEqual({ width: 400, height: 640 });
  });
});
