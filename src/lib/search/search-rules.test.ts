import { describe, expect, it } from "vitest";

import { NEW_ACCOUNT_NOINDEX_DAYS } from "@/lib/access-rules";
import { artifactVisibilities } from "@/lib/artifact-types";

import {
  artifactSitemapPaths,
  canChangeShowInSearch,
  isSearchIndexable,
  pageRobots,
  showInSearchAfterSharing,
  showInSearchProblem,
  SITEMAP_ARTIFACT_LIMIT,
  type SitemapCandidate,
} from "./search-rules";

const now = new Date("2026-11-08T12:00:00Z");
const established = new Date("2026-01-01T00:00:00Z");
const newAccount = new Date(now.getTime() - (NEW_ACCOUNT_NOINDEX_DAYS * 86_400_000 - 60_000));

describe("isSearchIndexable", () => {
  it("should never index when the artifact is private, team, or link, even with the setting on", () => {
    for (const visibility of ["private", "team", "link"] as const) {
      expect(isSearchIndexable({ visibility, showInSearch: true }, established, now)).toBe(false);
      expect(isSearchIndexable({ visibility, showInSearch: false }, established, now)).toBe(false);
    }
  });

  it("should not index a public artifact when its author has not turned the setting on", () => {
    expect(isSearchIndexable({ visibility: "public", showInSearch: false }, established, now)).toBe(false);
  });

  it("should index a public artifact when its author turned the setting on and the account is established", () => {
    expect(isSearchIndexable({ visibility: "public", showInSearch: true }, established, now)).toBe(true);
  });

  it("should not index an opted-in public artifact when the author's account is new", () => {
    expect(isSearchIndexable({ visibility: "public", showInSearch: true }, newAccount, now)).toBe(false);
  });

  it("should not index an opted-in public artifact when the account age is unknown", () => {
    expect(isSearchIndexable({ visibility: "public", showInSearch: true }, null, now)).toBe(false);
  });

  it("should allow indexing for exactly one combination when every visibility and setting is tried", () => {
    const indexable = artifactVisibilities.flatMap((visibility) =>
      [true, false].filter((showInSearch) => isSearchIndexable({ visibility, showInSearch }, established, now)).map((showInSearch) => ({ visibility, showInSearch })),
    );
    expect(indexable).toEqual([{ visibility: "public", showInSearch: true }]);
  });
});

describe("pageRobots", () => {
  it("should never follow links when the page is indexable or not", () => {
    expect(pageRobots(true)).toEqual({ index: true, follow: false });
    expect(pageRobots(false)).toEqual({ index: false, follow: false });
  });
});

describe("showInSearchAfterSharing", () => {
  it("should keep the setting when the artifact stays public", () => {
    expect(showInSearchAfterSharing(true, "public")).toBe(true);
  });

  it("should clear the setting when the artifact stops being public", () => {
    for (const visibility of ["private", "team", "link"] as const) expect(showInSearchAfterSharing(true, visibility)).toBe(false);
  });

  it("should never turn the setting on when sharing changes", () => {
    for (const visibility of artifactVisibilities) expect(showInSearchAfterSharing(false, visibility)).toBe(false);
  });
});

describe("canChangeShowInSearch", () => {
  it("should let the author change it when they act in the web app", () => {
    expect(canChangeShowInSearch({ actorId: "author", authorId: "author", actor: "person" })).toBe(true);
  });

  it("should refuse when an agent asks, even with the author's account", () => {
    expect(canChangeShowInSearch({ actorId: "author", authorId: "author", actor: "agent" })).toBe(false);
  });

  it("should refuse when someone other than the author asks", () => {
    expect(canChangeShowInSearch({ actorId: "teammate", authorId: "author", actor: "person" })).toBe(false);
  });
});

describe("showInSearchProblem", () => {
  it("should allow turning it on when the artifact is public", () => {
    expect(showInSearchProblem("public")).toBeNull();
  });

  it("should refuse turning it on when the artifact is not public", () => {
    for (const visibility of ["private", "team", "link"] as const) expect(showInSearchProblem(visibility)).toMatch(/public/);
  });
});

function candidate(publicId: string, overrides: Partial<SitemapCandidate> = {}): SitemapCandidate {
  return { publicId, visibility: "public", showInSearch: true, accountCreatedAt: established, ...overrides };
}

describe("artifactSitemapPaths", () => {
  it("should list only opted-in public artifacts from established accounts when candidates are mixed", () => {
    const paths = artifactSitemapPaths(
      [
        candidate("listed"),
        candidate("not-opted-in", { showInSearch: false }),
        candidate("link", { visibility: "link" }),
        candidate("team", { visibility: "team" }),
        candidate("private", { visibility: "private" }),
        candidate("new-account", { accountCreatedAt: newAccount }),
        candidate("unknown-age", { accountCreatedAt: null }),
      ],
      now,
    );
    expect(paths).toEqual(["/artifact/listed"]);
  });

  it("should list nothing when no artifact is eligible", () => {
    expect(artifactSitemapPaths([candidate("a", { showInSearch: false })], now)).toEqual([]);
  });

  it("should stop at the sitemap limit when there are more eligible artifacts", () => {
    const many = Array.from({ length: SITEMAP_ARTIFACT_LIMIT + 5 }, (_, index) => candidate(`a${String(index)}`));
    expect(artifactSitemapPaths(many, now)).toHaveLength(SITEMAP_ARTIFACT_LIMIT);
  });
});
