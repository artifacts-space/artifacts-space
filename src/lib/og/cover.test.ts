import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";

const mocks = vi.hoisted(() => ({ findReadableFile: vi.fn(), signedFileUrl: vi.fn() }));
vi.mock("@/lib/files/download", () => ({ findReadableFile: mocks.findReadableFile, signedFileUrl: mocks.signedFileUrl }));

const { isDrawableCoverImage, loadOgCover, ogGradientCover } = await import("./cover");

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const jpeg = { id: fileId, key: `files/${fileId}/c.jpg`, filename: "c.jpg", contentType: "image/jpeg", size: 3 };
const fetchMock = vi.fn();

describe("ogGradientCover", () => {
  it("should draw a gradient in the theme's light palette with the theme's ink for text", () => {
    const paper = presetTheme("paper");
    if (!paper) throw new Error("paper missing");
    const cover = ogGradientCover("mist", paper);
    expect(cover).toMatchObject({ type: "gradient", angle: 160 });
    if (cover?.type !== "gradient") throw new Error("no gradient");
    for (const value of [cover.from, cover.to, cover.ink, cover.muted]) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(ogGradientCover("mist", siteDefaultTheme())).not.toEqual(cover);
  });

  it("should draw nothing for no cover or an image cover", () => {
    expect(ogGradientCover(null, siteDefaultTheme())).toBeNull();
    expect(ogGradientCover(`file:${fileId}`, siteDefaultTheme())).toBeNull();
  });
});

describe("isDrawableCoverImage", () => {
  it("should draw only PNG and JPEG within the cap, because the renderer draws nothing for WebP, GIF, or AVIF", () => {
    expect(isDrawableCoverImage({ contentType: "image/png", size: 10 })).toBe(true);
    expect(isDrawableCoverImage({ contentType: "image/jpeg", size: 10 })).toBe(true);
    for (const contentType of ["image/webp", "image/gif", "image/avif", "image/svg+xml"]) expect(isDrawableCoverImage({ contentType, size: 10 })).toBe(false);
    expect(isDrawableCoverImage({ contentType: "image/png", size: 3_000_000 })).toBe(false);
  });
});

describe("loadOgCover", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mocks.signedFileUrl.mockResolvedValue({ url: "https://r2.example.com/signed", expiresAt: new Date() });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("should draw the image with its focal point when a signed-out reader may open the file", async () => {
    mocks.findReadableFile.mockResolvedValue(jpeg);
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const result = await loadOgCover(`file:${fileId}@30`, siteDefaultTheme());
    expect(mocks.findReadableFile).toHaveBeenCalledWith(fileId, null);
    expect(result).toEqual({ cover: { type: "image", src: "data:image/jpeg;base64,AQID", position: 30 }, degraded: false });
  });

  it("should keep the standard backdrop and never fetch when the file is not readable signed out", async () => {
    mocks.findReadableFile.mockResolvedValue(null);
    await expect(loadOgCover(`file:${fileId}`, siteDefaultTheme())).resolves.toEqual({ cover: null, degraded: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should keep the standard backdrop for a WebP cover without fetching it", async () => {
    mocks.findReadableFile.mockResolvedValue({ ...jpeg, contentType: "image/webp" });
    await expect(loadOgCover(`file:${fileId}`, siteDefaultTheme())).resolves.toEqual({ cover: null, degraded: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should fall back and say so when the image cannot be fetched this time", async () => {
    mocks.findReadableFile.mockResolvedValue(jpeg);
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(loadOgCover(`file:${fileId}`, siteDefaultTheme())).resolves.toEqual({ cover: null, degraded: true });
    fetchMock.mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadOgCover(`file:${fileId}`, siteDefaultTheme())).resolves.toEqual({ cover: null, degraded: true });
  });

  it("should draw a gradient cover without touching files", async () => {
    const result = await loadOgCover("dawn", siteDefaultTheme());
    expect(result.cover?.type).toBe("gradient");
    expect(mocks.findReadableFile).not.toHaveBeenCalled();
  });
});
