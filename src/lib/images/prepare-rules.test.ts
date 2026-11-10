import { describe, expect, it } from "vitest";

import { COVER_MAX_BYTES, isCoverUploadAllowed } from "@/lib/files/cover-rules";
import { isIconUploadAllowed } from "@/lib/files/icon-rules";

import {
  coverPrepareProfile,
  hasTransparentPixel,
  iconPrepareProfile,
  DOCUMENT_IMAGE_MAX_BYTES,
  documentPrepareProfile,
  imageOutputType,
  uploadsUnprepared,
  imageSourceProblem,
  imageTargetSize,
  isHeic,
  mayHaveAlpha,
  preparedFilename,
} from "./prepare-rules";

const COVER_MAX_SIDE = coverPrepareProfile.maxSide;
const coverTargetSize = (width: number, height: number) => imageTargetSize(width, height, COVER_MAX_SIDE);
const coverOutputType = (source: { size: number }, hasAlpha: boolean) => imageOutputType(source, hasAlpha, coverPrepareProfile);
const coverSourceProblem = (file: { type: string; name: string; size: number }) => imageSourceProblem(file, coverPrepareProfile);

describe("coverTargetSize", () => {
  it("should scale a phone photo down so its longest side is 2400 px when it is larger", () => {
    expect(coverTargetSize(4032, 3024)).toEqual({ width: COVER_MAX_SIDE, height: 1800 });
    expect(coverTargetSize(3024, 4032)).toEqual({ width: 1800, height: COVER_MAX_SIDE });
  });

  it("should never scale an image up when it is already small enough", () => {
    expect(coverTargetSize(1500, 600)).toEqual({ width: 1500, height: 600 });
    expect(coverTargetSize(2400, 900)).toEqual({ width: 2400, height: 900 });
  });

  it("should keep at least one pixel when an image is extremely thin", () => {
    expect(coverTargetSize(100_000, 10)).toEqual({ width: COVER_MAX_SIDE, height: 1 });
  });
});

describe("coverOutputType", () => {
  it("should keep PNG only when the image has transparency and already fit the cap", () => {
    expect(coverOutputType({ size: 500_000 }, true)).toBe("image/png");
  });

  it("should use JPEG for photos and for big transparent images when the PNG would not fit", () => {
    expect(coverOutputType({ size: 500_000 }, false)).toBe("image/jpeg");
    expect(coverOutputType({ size: COVER_MAX_BYTES + 1 }, true)).toBe("image/jpeg");
  });
});

describe("coverSourceProblem", () => {
  it("should accept large phone photos, including HEIC, when they are images", () => {
    expect(coverSourceProblem({ type: "image/jpeg", name: "IMG_0001.JPG", size: 9_000_000 })).toBeNull();
    expect(coverSourceProblem({ type: "image/heic", name: "IMG_0002.HEIC", size: 3_000_000 })).toBeNull();
    expect(coverSourceProblem({ type: "", name: "IMG_0003.heic", size: 3_000_000 })).toBeNull();
  });

  it("should refuse SVG, other files, empty files, and huge files with a message", () => {
    expect(coverSourceProblem({ type: "image/svg+xml", name: "logo.svg", size: 900 })).toMatch(/cannot be a cover/);
    expect(coverSourceProblem({ type: "application/pdf", name: "plan.pdf", size: 900 })).toMatch(/cannot be a cover/);
    expect(coverSourceProblem({ type: "image/png", name: "a.png", size: 0 })).toMatch(/empty/);
    expect(coverSourceProblem({ type: "image/png", name: "a.png", size: 60_000_000 })).toMatch(/50 MB/);
  });
});

describe("helpers", () => {
  it("should tell HEIC photos apart by type or by name", () => {
    expect(isHeic({ type: "image/heif", name: "a" })).toBe(true);
    expect(isHeic({ type: "", name: "a.HEIF" })).toBe(true);
    expect(isHeic({ type: "image/jpeg", name: "a.heic" })).toBe(false);
  });

  it("should check transparency only for types that can carry it", () => {
    expect(mayHaveAlpha("image/png")).toBe(true);
    expect(mayHaveAlpha("image/jpeg")).toBe(false);
  });

  it("should find a pixel that is not fully opaque", () => {
    expect(hasTransparentPixel([1, 2, 3, 255, 4, 5, 6, 255])).toBe(false);
    expect(hasTransparentPixel([1, 2, 3, 255, 4, 5, 6, 254])).toBe(true);
  });

  it("should name the prepared file after the picked one with the new extension", () => {
    expect(preparedFilename("IMG_0001.HEIC", "image/jpeg")).toBe("IMG_0001.jpg");
    expect(preparedFilename("logo.final.png", "image/png")).toBe("logo.final.png");
    expect(preparedFilename(".png", "image/jpeg", "cover")).toBe("cover.jpg");
    expect(preparedFilename(".png", "image/png")).toBe("image.png");
  });

  it("should leave the server's cap as the authority: an unprepared 3 MB photo still fails the upload check", () => {
    expect(isCoverUploadAllowed({ type: "image/jpeg", size: 3_000_000 })).toBe(false);
  });
});

describe("icon profile", () => {
  it("should size icons to at most 512 px when a phone photo is picked", () => {
    expect(imageTargetSize(4032, 3024, iconPrepareProfile.maxSide)).toEqual({ width: 512, height: 384 });
    expect(imageTargetSize(256, 256, iconPrepareProfile.maxSide)).toEqual({ width: 256, height: 256 });
  });

  it("should keep transparency from a large logo when it is an icon, unlike a cover", () => {
    expect(imageOutputType({ size: 5_000_000 }, true, iconPrepareProfile)).toBe("image/png");
    expect(imageOutputType({ size: 5_000_000 }, true, coverPrepareProfile)).toBe("image/jpeg");
    expect(imageOutputType({ size: 5_000_000 }, false, iconPrepareProfile)).toBe("image/jpeg");
  });

  it("should accept phone photos as icon sources and name the use in the refusal", () => {
    expect(imageSourceProblem({ type: "image/heic", name: "IMG.HEIC", size: 4_000_000 }, iconPrepareProfile)).toBeNull();
    expect(imageSourceProblem({ type: "image/svg+xml", name: "logo.svg", size: 900 }, iconPrepareProfile)).toMatch(/cannot be an icon/);
  });

  it("should leave the server's 1 MB icon cap as the authority when a photo is not prepared", () => {
    expect(isIconUploadAllowed({ type: "image/jpeg", size: 2_000_000 })).toBe(false);
  });
});

describe("documentPrepareProfile", () => {
  it("should keep a screenshot a PNG when it fits, and make a photo a JPEG", () => {
    expect(imageOutputType({ size: 2_000_000, type: "image/png" }, false, documentPrepareProfile)).toBe("image/png");
    expect(imageOutputType({ size: 2_000_000, type: "image/jpeg" }, false, documentPrepareProfile)).toBe("image/jpeg");
    expect(imageOutputType({ size: 2_000_000, type: "image/webp" }, true, documentPrepareProfile)).toBe("image/png");
  });

  it("should make a PNG too large to keep a JPEG", () => {
    expect(imageOutputType({ size: DOCUMENT_IMAGE_MAX_BYTES + 1, type: "image/png" }, false, documentPrepareProfile)).toBe("image/jpeg");
  });

  it("should never keep PNG sources for covers", () => {
    expect(imageOutputType({ size: 1000, type: "image/png" }, false, coverPrepareProfile)).toBe("image/jpeg");
  });

  it("should upload a GIF that fits as it is, and redraw every other image", () => {
    expect(uploadsUnprepared({ type: "image/gif", size: 1_000_000 }, documentPrepareProfile)).toBe(true);
    expect(uploadsUnprepared({ type: "image/gif", size: DOCUMENT_IMAGE_MAX_BYTES + 1 }, documentPrepareProfile)).toBe(false);
    expect(uploadsUnprepared({ type: "image/png", size: 1000 }, documentPrepareProfile)).toBe(false);
  });

  it("should name the use when a picked file is not an image", () => {
    expect(imageSourceProblem({ type: "application/pdf", name: "a.pdf", size: 10 }, documentPrepareProfile)).toContain("cannot be an image here");
  });
});
