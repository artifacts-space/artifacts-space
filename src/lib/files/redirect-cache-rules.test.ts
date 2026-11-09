import { describe, expect, it } from "vitest";

import { fileLimits } from "./config";
import { presignDownload, type R2Config } from "./r2";
import { downloadUrlMinLifetimeSeconds, fileRedirectCacheHeaders, fileRedirectMaxAgeSeconds } from "./redirect-cache-rules";

const config: R2Config = { accountId: "0123456789abcdef0123456789abcdef", bucket: "artifacts-space", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

/** Seconds the URL presignDownload returns at `now` keeps working. */
async function urlLifetimeSeconds(now: Date): Promise<number> {
  const { expiresAt } = await presignDownload(config, { key: "files/a/b.png", contentType: "image/png", disposition: "inline", expiresIn: fileLimits.downloadUrlSeconds, now });
  return (expiresAt.getTime() - now.getTime()) / 1000;
}

describe("file redirect caching", () => {
  it("should keep the redirect for less time than the signed URL works when the limits change", () => {
    expect(fileRedirectMaxAgeSeconds).toBeGreaterThan(0);
    expect(fileRedirectMaxAgeSeconds).toBeLessThan(downloadUrlMinLifetimeSeconds);
  });

  it("should leave at least a minute of margin before the signed URL stops working", () => {
    expect(downloadUrlMinLifetimeSeconds - fileRedirectMaxAgeSeconds).toBeGreaterThanOrEqual(60);
  });

  it("should sign URLs that outlive a kept redirect when signed at the end of a rounding window", async () => {
    const window = fileLimits.downloadSigningWindowSeconds * 1000;
    const worstCase = new Date(Math.floor(Date.parse("2026-11-09T12:00:00Z") / window) * window + window - 1);
    const lifetime = await urlLifetimeSeconds(worstCase);
    expect(lifetime).toBeGreaterThanOrEqual(downloadUrlMinLifetimeSeconds);
    expect(lifetime).toBeGreaterThan(fileRedirectMaxAgeSeconds);
  });

  it("should never let a shared cache keep the redirect", () => {
    expect(fileRedirectCacheHeaders["Cache-Control"]).toBe(`private, max-age=${String(fileRedirectMaxAgeSeconds)}`);
    expect(fileRedirectCacheHeaders.Vary).toBe("Cookie, Authorization");
  });
});
