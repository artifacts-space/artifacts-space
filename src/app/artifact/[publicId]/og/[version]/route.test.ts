import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Preview images are never indexed, whether the artifact may be previewed
 * or not: a year-long cached image would outlive the author turning
 * "Show in search engines" off.
 */

const mocks = vi.hoisted(() => ({ hitRateLimits: vi.fn(), loadArtifactOg: vi.fn() }));

vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimits: mocks.hitRateLimits, rateLimitMessage: () => "Try again later." }));
vi.mock("@/lib/abuse/network-key", () => ({ networkKey: () => "network" }));
vi.mock("@/lib/og/artifact-og", () => ({ loadArtifactOg: mocks.loadArtifactOg }));
vi.mock("@/lib/og/render", () => ({
  artifactImageResponse: (_og: unknown, headers: Record<string, string>) => new Response("artifact", { headers }),
  siteImageResponse: (headers: Record<string, string>) => new Response("site", { headers }),
}));

const { GET } = await import("./route");

function get() {
  const request = new NextRequest("https://artifacts.space/artifact/abc/og/v1.k");
  return GET(request, { params: Promise.resolve({ publicId: "abc", version: "v1.k" }) });
}

describe("artifact preview image route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hitRateLimits.mockResolvedValue(null);
  });

  it("should send noindex, nofollow when the artifact's preview is drawn", async () => {
    mocks.loadArtifactOg.mockResolvedValue({ coverDegraded: false, themeCurrent: true });
    const response = await get();
    await expect(response.text()).resolves.toBe("artifact");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("should send noindex, nofollow when the site image stands in", async () => {
    mocks.loadArtifactOg.mockResolvedValue(null);
    const response = await get();
    await expect(response.text()).resolves.toBe("site");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
