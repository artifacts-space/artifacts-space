import type { Page } from "@playwright/test";

/** A detailed 4032 × 3024 JPEG, like a phone photo, drawn in the browser. Over 2 MB. Shared by the cover and icon photo checks. */
export async function largePhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4032;
    canvas.height = 3024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 7;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const grain = (seed % 48) - 24;
      pixels.data[index] = 110 + Math.round(80 * Math.sin(x / 90)) + grain;
      pixels.data[index + 1] = 120 + Math.round(70 * Math.cos(y / 70)) + grain;
      pixels.data[index + 2] = 140 + Math.round(60 * Math.sin((x + y) / 120)) + grain;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}
