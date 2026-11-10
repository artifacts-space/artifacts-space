import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/abuse/rate-limit";
import type * as RequestViewer from "@/lib/request-viewer";

/*
 * The file route: a viewer who may read the file gets a redirect to a signed
 * R2 URL that only their own browser may keep for a few minutes. Refusals
 * (404), rate limits (429), and errors (500) are never cached. The viewer,
 * the file lookup, the signer, the network key, and the rate limit are
 * mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), file: vi.fn(), sign: vi.fn(), limits: vi.fn() }));

vi.mock("@/lib/abuse/network-key", () => ({ networkKey: () => "network-1" }));
vi.mock("@/lib/request-viewer", async (importOriginal) => ({ ...(await importOriginal<typeof RequestViewer>()), resolveRequestViewer: mocks.viewer }));
vi.mock("@/lib/files/download", () => ({ findReadableFile: mocks.file, signedFileUrl: mocks.sign }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof RateLimit>()), hitRateLimits: mocks.limits }));

const { GET } = await import("./route");

const fileId = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";
const signedUrl = "https://acct.r2.cloudflarestorage.com/bucket/files/a/b.png?X-Amz-Signature=abc";

function call(query = "", headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/files/${fileId}${query}`, { headers }), { params: Promise.resolve({ id: fileId }) });
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
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.file).toHaveBeenCalledWith(fileId, "user-1");
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ id: fileId }), { download: false });
  });

  it("should sign a download link, kept under its own URL, when ?download=1 is set", async () => {
    const response = await call("?download=1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=240");
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ id: fileId }), { download: true });
  });

  it("should look the file up as signed out when the bearer token is refused", async () => {
    mocks.viewer.mockResolvedValue({ status: "invalid-token" });
    mocks.file.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.file).toHaveBeenCalledWith(fileId, null);
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

  it("should count a video seek against the playback budgets, and still check access, when the range starts past the first byte", async () => {
    mocks.file.mockResolvedValue(null);
    const response = await call("", { Range: "bytes=5242880-" });
    expect(mocks.limits).toHaveBeenCalledWith([{ name: "fileRangeByNetwork", subject: "network-1" }, { name: "fileRangeByNetworkFile", subject: `network-1:${fileId}` }]);
    expect(response.status).toBe(404);
  });

  it("should count a player's first request as a file view", async () => {
    await call("", { Range: "bytes=0-" });
    expect(mocks.limits).toHaveBeenCalledWith([{ name: "fileDownloadByNetwork", subject: "network-1" }]);
  });

  it("should answer an uncached 500 when signing fails", async () => {
    mocks.sign.mockRejectedValue(new Error("R2 config missing"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
