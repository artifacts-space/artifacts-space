import { describe, expect, it } from "vitest";

import { OG_MONO_FAMILY, OG_SANS_FAMILY, ogMonoFont, ogSansFonts } from "@/lib/og/fonts";

/** The first four bytes of a TrueType font: version 1.0 (0x00010000). */
function isTrueType(data: ArrayBuffer): boolean {
  const view = new DataView(data);
  return data.byteLength > 1024 && view.getUint32(0) === 0x00010000;
}

describe("og fonts", () => {
  it("should load Geist Medium and SemiBold when preview images render sans text", () => {
    expect(ogSansFonts.map((font) => [font.name, font.weight])).toEqual([
      [OG_SANS_FAMILY, 500],
      [OG_SANS_FAMILY, 600],
    ]);
    expect(ogSansFonts.every((font) => isTrueType(font.data))).toBe(true);
  });

  it("should load Geist Mono Regular when preview images render code", () => {
    expect(ogMonoFont.name).toBe(OG_MONO_FAMILY);
    expect(ogMonoFont.weight).toBe(400);
    expect(isTrueType(ogMonoFont.data)).toBe(true);
  });

  it("should load different files for each weight", () => {
    const [medium, semiBold] = ogSansFonts;
    expect(medium?.data.byteLength).not.toBe(semiBold?.data.byteLength);
  });
});
