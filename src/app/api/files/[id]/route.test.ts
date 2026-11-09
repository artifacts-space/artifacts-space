import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/abuse/rate-limit";

/*
 * The file route: a viewer who may read the file gets a redirect to a signed
 * R2 URL that only their own browser may keep for a few minutes. Refusals
 * (404), rate limits (429), and errors (500) are never cached. The viewer,
 * the file lookup, the signer, the network key, and the rate limit are
 * mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), file: vi.fn(), sign: vi.fn(), limits: vi.fn() }));

vi.mock("@/lib/abuse/network-key", () => ({ networkKey: () => "network-1" }));
vi.mock("@/lib/request-viewer", () => ({ resolveRequestViewer: mocks.viewer, viewerUserId: (viewer: { userId?: string }) => viewer.userId ?? null }));
vi.mock("@/lib/files/download", () => ({ findReadableFile: mocks.file, signedFileUrl: mocks.sign }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof RateLimit>()), hitRateLimits: mocks.limits }));

const { GET } = await import("./route");

const fileId = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";
const signedUrl = "https://acct.r2.cloudflarestorage.com/bucket/files/a/b.png?X-Amz-Signature=abc";

function call() {
  return GET(new Request(`http://localhost/api/files/${fileId}`), { params: Promise.resolve({ id: fileId }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.limits.mockResolvedValue(null);
  mocks.viewer.mockResolvedValue({ status: "session", userId: "user-1" });
  mocks.file.mockResolvedValue({ id: fileId, key: "files/a/b.png", filename: "b.png", contentType: "image/png" });
  mocks.sign.mockResolvedValue({ url: signedUrl, expiresAt: new Date() });
});

describe("GET /api/files/[id]", () => {
  it("should let only the viewer's browser keep the redirect for four minutes when they may read the file", async () => {
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(signedUrl);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=240");
    expect(response.headers.get("Vary")).toBe("Cookie, Authorization");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("should answer an uncached 404 when the viewer may not read the file", async () => {
    mocks.file.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Location")).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("should answer an uncached 429 when the network is over its limit", async () => {
    mocks.limits.mockResolvedValue({ name: "fileDownloadByNetwork", retryAfterSeconds: 30 });
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.file).not.toHaveBeenCalled();
  });

  it("should answer an uncached 500 when signing fails", async () => {
    mocks.sign.mockRejectedValue(new Error("R2 config missing"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
