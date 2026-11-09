import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SitemapCandidate } from "@/lib/search/search-rules";

/*
 * sitemap.xml: it lists only public artifacts opted into search engines,
 * even when the query returns more, keeps the list for an hour, and falls
 * back to the site's pages, kept for a minute, when the database fails. The
 * query and Next's cache lifetime are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({ candidates: vi.fn(), cacheLife: vi.fn() }));

vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife }));
vi.mock("@/lib/search/search-queries", () => ({ sitemapCandidates: mocks.candidates }));

const { default: sitemap } = await import("./sitemap");

const established = new Date("2020-01-01T00:00:00Z");

function candidate(publicId: string, overrides: Partial<SitemapCandidate> = {}): SitemapCandidate {
  return { publicId, visibility: "public", showInSearch: true, accountCreatedAt: established, ...overrides };
}

async function listedArtifacts(): Promise<string[]> {
  return (await sitemap()).map((entry) => new URL(entry.url).pathname).filter((path) => path.startsWith("/artifact/"));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap", () => {
  it("should never list private, link, team, or opted-out artifacts when the query returns them", async () => {
    mocks.candidates.mockResolvedValue([
      candidate("listed"),
      candidate("opted-out", { showInSearch: false }),
      candidate("private", { visibility: "private" }),
      candidate("team", { visibility: "team" }),
      candidate("link", { visibility: "link" }),
      candidate("new-account", { accountCreatedAt: new Date() }),
    ]);
    expect(await listedArtifacts()).toEqual(["/artifact/listed"]);
  });

  it("should keep the artifact list for an hour when the database answers", async () => {
    mocks.candidates.mockResolvedValue([candidate("listed")]);
    await sitemap();
    expect(mocks.cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it("should list the site's pages and no artifacts, kept for a minute, when the database fails", async () => {
    mocks.candidates.mockRejectedValue(new Error("DATABASE_URL is required"));
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toContain("https://artifacts.example.com/docs");
    expect(await listedArtifacts()).toEqual([]);
    expect(mocks.cacheLife).toHaveBeenLastCalledWith("minutes");
    expect(mocks.cacheLife).not.toHaveBeenCalledWith("hours");
  });
});
