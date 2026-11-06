import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Privacy proof for the version cache: approved versions are cached by
 * version id (src/lib/versions/cache.ts). These tests run the real access
 * decision against stubbed rows and check that private and team artifacts
 * never reach the cache, for any viewer, even when a stale approved version
 * id is still on the row.
 */

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], cachedView: vi.fn() }));

function chain(): unknown {
  const next = () => Promise.resolve(mocks.rows.shift() ?? []);
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "innerJoin", "leftJoin"]) builder[name] = () => builder;
  builder.limit = next;
  return builder;
}

vi.mock("@/db", () => ({ getDb: () => ({ select: () => chain() }) }));
vi.mock("@/lib/versions/cache", () => ({ cachedVersionView: mocks.cachedView }));

const { getArtifactAccess, getViewableArtifact } = await import("./access");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const author = "author-1";
const savedAt = new Date("2026-11-06T00:00:00Z");

function row(visibility: "private" | "team" | "link" | "public", member: boolean) {
  return {
    record: {
      id: "art-1", publicId, shareId: "s", userId: author, originalAuthorId: null, teamId: "team-1", visibility,
      // A stale approved version id, as if sharing was just withdrawn: it must never be served.
      approvedVersionId: "version-1",
      title: "Latest title", summary: "", kind: "markdown", language: "", project: "", sessionId: "", source: "", metadata: {},
      createdAt: savedAt, updatedAt: savedAt, updatedBy: null,
    },
    memberId: member ? "member-1" : null,
    teamPersonal: false,
    approvedTitle: "Approved title",
    approvedSavedAt: savedAt,
    approvedBy: author,
  };
}

const approved = { title: "Approved title", summary: "", content: "approved", kind: "markdown", language: "", project: "", source: "", metadata: {}, updatedAt: savedAt };

describe("access decision and the version cache", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows = [];
    mocks.cachedView.mockResolvedValue(approved);
  });

  it("should refuse a private artifact to anonymous visitors and other people without touching the cache", async () => {
    for (const viewer of [null, "someone-else"]) {
      mocks.rows = [[row("private", false)]];
      await expect(getViewableArtifact(publicId, viewer)).resolves.toBeNull();
    }
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should refuse a team artifact to anonymous visitors and non-members without touching the cache", async () => {
    for (const viewer of [null, "outsider"]) {
      mocks.rows = [[row("team", false)]];
      await expect(getArtifactAccess(publicId, viewer)).resolves.toBeNull();
    }
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should read the private artifact fresh from its row when the author opens it", async () => {
    mocks.rows = [[row("private", false)], [{ content: "latest private content" }]];
    const viewable = await getViewableArtifact(publicId, author);
    expect(viewable?.view.content).toBe("latest private content");
    expect(viewable?.version.source).toBe("latest");
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should read a team artifact fresh for members, never from the cache", async () => {
    mocks.rows = [[row("team", true)], [{ content: "team content" }]];
    const viewable = await getViewableArtifact(publicId, "member-1");
    expect(viewable?.view.content).toBe("team content");
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should serve the cached approved version when an anonymous visitor opens a link artifact", async () => {
    mocks.rows = [[row("link", false)]];
    const viewable = await getViewableArtifact(publicId, null);
    expect(viewable?.view.content).toBe("approved");
    expect(viewable?.version).toEqual({ source: "approved", versionId: "version-1" });
    // Keyed by version id and save time, so a merged save never reuses an old entry.
    expect(mocks.cachedView).toHaveBeenCalledWith("version-1", savedAt.toISOString());
  });

  it("should give the author the latest version of a public artifact, not the cached approved one", async () => {
    mocks.rows = [[row("public", false)], [{ content: "author's latest" }], []];
    const viewable = await getViewableArtifact(publicId, author);
    expect(viewable?.view.content).toBe("author's latest");
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should give a reader outside the team the approved title without loading content", async () => {
    mocks.rows = [[row("public", false)]];
    const access = await getArtifactAccess(publicId, "outsider");
    expect(access?.served.title).toBe("Approved title");
    expect(access?.version.source).toBe("approved");
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should answer not found when the artifact does not exist", async () => {
    mocks.rows = [[]];
    await expect(getViewableArtifact(publicId, null)).resolves.toBeNull();
  });
});
