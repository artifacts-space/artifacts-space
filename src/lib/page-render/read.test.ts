import { beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@/lib/abuse/rate-limit";

import type { BrowserRunConfig, DrawOutcome, DrawnPage } from "./browser";
import type { PageViewport } from "./rules";
import { openRenderToken } from "./token";

/*
 * readPageImage with the database, the rate limit, and the hosted browser
 * replaced at their boundaries: who gets a picture, and what the browser is
 * asked to open.
 */

const data = vi.hoisted(() => ({ getEditableArtifact: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<object>()), enforceRateLimit: data.enforceRateLimit }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { readPageImage } = await import("./read");

const secret = "a test secret that is long enough to derive keys from";
const config: BrowserRunConfig = { accountId: "acct", apiToken: "t" };
const picture: DrawnPage = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" };
const savedAt = new Date("2026-11-24T09:30:00.000Z");
const now = new Date("2026-11-24T09:31:00.000Z");
const drawn: DrawOutcome = { state: "drawn", picture };
const failed: DrawOutcome = { state: "failed" };
const record = { id: "internal-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", kind: "html", title: "Launch", updatedAt: savedAt };

function deps(draw: (config: BrowserRunConfig, url: string, viewport: PageViewport) => Promise<DrawOutcome>, configured = true) {
  return { config: () => (configured ? config : null), draw: vi.fn(draw), now: () => now };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  data.enforceRateLimit.mockResolvedValue(undefined);
  data.getEditableArtifact.mockResolvedValue(record);
});

describe("readPageImage", () => {
  it("should draw the page through a render token for the caller and this save when the caller may edit it", async () => {
    const used = deps(() => Promise.resolve(drawn));
    const result = await readPageImage("user-1", { publicId: record.publicId }, used);
    expect(result).toMatchObject({ state: "image", facts: { title: "Launch", viewport: { width: 1280, height: 800 }, savedAt: savedAt.toISOString() } });
    const [, url] = used.draw.mock.calls[0] ?? [];
    const token = String(url).replace("https://artifacts.space/render/page/", "");
    expect(openRenderToken(token, now, secret)).toEqual({ userId: "user-1", artifactId: "internal-1", stamp: savedAt.getTime() });
  });

  it("should refuse and draw nothing when the caller cannot edit the artifact", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const used = deps(() => Promise.resolve(drawn));
    await expect(readPageImage("reader-1", { publicId: record.publicId }, used)).rejects.toThrow("cannot edit");
    expect(used.draw).not.toHaveBeenCalled();
  });

  it("should say pictures are off before it counts or reads anything when no browser is set up", async () => {
    const result = await readPageImage("user-1", { publicId: record.publicId }, deps(() => Promise.resolve(drawn), false));
    expect(result).toMatchObject({ state: "refused", refusal: { code: "page_images_off" } });
    expect(data.enforceRateLimit).not.toHaveBeenCalled();
    expect(data.getEditableArtifact).not.toHaveBeenCalled();
  });

  it("should refuse an artifact that is not an HTML page", async () => {
    data.getEditableArtifact.mockResolvedValue({ ...record, kind: "markdown" });
    const used = deps(() => Promise.resolve(drawn));
    expect(await readPageImage("user-1", { publicId: record.publicId }, used)).toMatchObject({ state: "refused", refusal: { code: "not_html" } });
    expect(used.draw).not.toHaveBeenCalled();
  });

  it("should stop at the rate limit before the edit check", async () => {
    data.enforceRateLimit.mockRejectedValue(new RateLimitError("pageImageRead", 60));
    await expect(readPageImage("user-1", { publicId: record.publicId }, deps(() => Promise.resolve(drawn)))).rejects.toBeInstanceOf(RateLimitError);
    expect(data.getEditableArtifact).not.toHaveBeenCalled();
  });

  it("should refuse a window over the pixel limit and draw nothing", async () => {
    const used = deps(() => Promise.resolve(drawn));
    await expect(readPageImage("user-1", { publicId: record.publicId, width: 1568, height: 1568 }, used)).rejects.toThrow("too big");
    expect(used.draw).not.toHaveBeenCalled();
  });

  it("should say the page changed when it was saved again while it was drawn", async () => {
    data.getEditableArtifact.mockResolvedValueOnce(record).mockResolvedValueOnce({ ...record, updatedAt: new Date(savedAt.getTime() + 1000) });
    const result = await readPageImage("user-1", { publicId: record.publicId }, deps(() => Promise.resolve(failed)));
    expect(result).toMatchObject({ state: "refused", refusal: { code: "page_changed" } });
  });

  it("should say the picture was refused, and not that the page failed to start, when a picture failed the check", async () => {
    const result = await readPageImage("user-1", { publicId: record.publicId }, deps(() => Promise.resolve({ state: "refused" })));
    expect(result).toMatchObject({ state: "refused", refusal: { code: "page_picture_refused" } });
    expect(data.getEditableArtifact).toHaveBeenCalledTimes(1);
  });

  it("should say the page was not drawn when the browser failed and nothing was saved since", async () => {
    const result = await readPageImage("user-1", { publicId: record.publicId }, deps(() => Promise.resolve(failed)));
    expect(result).toMatchObject({ state: "refused", refusal: { code: "page_not_drawn" } });
  });
});
