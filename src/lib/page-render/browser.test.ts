import { afterEach, describe, expect, it, vi } from "vitest";

import { browserRunConfigFromEnv, checkedPicture, drawPage, pictureProblem } from "./browser";
import { pageImageLimits, pageShownSelector, pageViewportSchema, screenshotRequestBody } from "./rules";

/** The first bytes of an extended WebP (VP8X) of the given size, padded to `length`. */
function webp(width: number, height: number, length = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes[16] = 10;
  const put24 = (offset: number, value: number) => { bytes.set([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff], offset); };
  put24(24, width - 1);
  put24(27, height - 1);
  return bytes;
}

const viewport = { width: 1280, height: 800 };
const config = { accountId: "acct", apiToken: "secret-token" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the window size", () => {
  it("should default to 1280 by 800 when no size is given", () => {
    expect(pageViewportSchema.parse({})).toEqual({ width: 1280, height: 800 });
  });

  it("should take a phone's window when asked for one", () => {
    expect(pageViewportSchema.parse({ width: 390, height: 844 })).toEqual({ width: 390, height: 844 });
  });

  it("should refuse a window over the pixel limit when both sides are allowed", () => {
    expect(pageViewportSchema.safeParse({ width: 1568, height: 1568 }).success).toBe(false);
    expect(1568 * 784).toBeLessThanOrEqual(pageImageLimits.maxPixels);
  });
});

describe("the screenshot request", () => {
  it("should wait for the page to be shown in its frame and ask for one WebP of the window", () => {
    const body = screenshotRequestBody("https://artifacts.space/render/page/t", viewport);
    expect(body).toMatchObject({ url: "https://artifacts.space/render/page/t", viewport: { width: 1280, height: 800 }, waitForSelector: { selector: pageShownSelector }, screenshotOptions: { type: "webp" } });
    expect(JSON.stringify(body)).not.toContain("cookie");
  });
});

describe("checking the picture", () => {
  it("should take a WebP of the window's exact size", () => {
    expect(checkedPicture(webp(1280, 800), viewport)?.contentType).toBe("image/webp");
  });

  it("should refuse a picture of another size, another type, or over the byte limit", () => {
    expect(checkedPicture(webp(1280, 801), viewport)).toBeNull();
    expect(checkedPicture(new Uint8Array(64), viewport)).toBeNull();
    expect(checkedPicture(webp(1280, 800, pageImageLimits.maxBytes + 1), viewport)).toBeNull();
  });
});

describe("why a picture fails", () => {
  it("should name the sizes when a picture came back at another scale", () => {
    expect(pictureProblem(webp(2560, 1600), viewport)).toBe("2560 by 1600, not the window's 1280 by 800");
  });

  it("should say a picture over the byte cap is too big, so a smaller window can help", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(() => Promise.resolve(new Response(webp(1280, 800, pageImageLimits.maxBytes + 1), { status: 200 })));
    expect(await drawPage(config, "https://artifacts.space/render/page/t", viewport, fetcher)).toEqual({ state: "refused", tooBig: true });
  });

  it("should name the bytes when a picture is over the limit", () => {
    expect(pictureProblem(webp(1280, 800, pageImageLimits.maxBytes + 1), viewport)).toContain("bytes, over");
  });

  it("should be null when the picture passes", () => {
    expect(pictureProblem(webp(1280, 800), viewport)).toBeNull();
  });
});

describe("Browser Run settings", () => {
  it("should be off when the API token is missing", () => {
    expect(browserRunConfigFromEnv({ CLOUDFLARE_ACCOUNT_ID: "acct" })).toBeNull();
  });

  it("should use the R2 account when no account of its own is set", () => {
    expect(browserRunConfigFromEnv({ CLOUDFLARE_BROWSER_RUN_TOKEN: "t", R2_ACCOUNT_ID: "r2" })).toEqual({ accountId: "r2", apiToken: "t" });
  });
});

describe("drawing a page", () => {
  it("should return the checked picture when the browser answers with one", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetcher = vi.fn(() => Promise.resolve(new Response(webp(1280, 800), { status: 200, headers: { "Content-Type": "image/webp" } })));
    const drawn = await drawPage(config, "https://artifacts.space/render/page/t", viewport, fetcher);
    expect(drawn.state === "drawn" ? drawn.picture.contentType : null).toBe("image/webp");
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.cloudflare.com/client/v4/accounts/acct/browser-run/screenshot");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-token" });
  });

  it("should call the picture refused when one came back of another size", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(() => Promise.resolve(new Response(webp(640, 400), { status: 200 })));
    expect(await drawPage(config, "https://artifacts.space/render/page/t", viewport, fetcher)).toEqual({ state: "refused", tooBig: false });
  });

  it("should fail without logging the address when the browser refuses", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(() => Promise.resolve(new Response("{}", { status: 422 })));
    expect(await drawPage(config, "https://artifacts.space/render/page/secret-render-token", viewport, fetcher)).toEqual({ state: "failed" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret-render-token");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret-token");
  });

  it("should fail when the browser cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    expect(await drawPage(config, "https://artifacts.space/render/page/t", viewport, fetcher)).toEqual({ state: "failed" });
  });
});
