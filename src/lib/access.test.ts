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

function row(visibility: "private" | "team" | "link" | "public", member: boolean, ownerMember = false) {
  return {
    record: {
      id: "art-1", publicId, shareId: "s", userId: author, originalAuthorId: null, teamId: "team-1", visibility,
      // A stale approved version id, as if sharing was just withdrawn: it must never be served.
      approvedVersionId: "version-1",
      title: "Latest title", icon: "tabler:bug", cover: "file:0f8fad5b-d9cb-469f-a165-70867728950e@20", summary: "", kind: "markdown", language: "", project: "", sessionId: "", source: "", metadata: {},
      createdAt: savedAt, updatedAt: savedAt, updatedBy: null,
      // The pending edit came through Cursor; the approved version through Claude Code.
      harness: "cursor", harnessOverride: null as string | null,
    },
    memberId: member ? "member-1" : null,
    // Set only when the author is an agent the viewer added and the viewer is still in its team (see subjectQuery).
    ownerMemberId: ownerMember ? "owner-member-1" : null,
    teamPersonal: false,
    approvedTitle: "Approved title",
    approvedIcon: "🚀",
    approvedCover: "mist",
    approvedSavedAt: savedAt,
    approvedBy: author,
    approvedHarness: "claude-code" as string | null,
  };
}

const approved = { title: "Approved title", icon: "🚀", cover: "mist", summary: "", content: "approved", kind: "markdown", language: "", project: "", source: "", metadata: {}, updatedAt: savedAt };

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

  it("should let the person who added the agent read and edit its private artifact when they are still in the agent's team", async () => {
    mocks.rows = [[row("private", false, true)], [{ content: "agent notes" }]];
    const viewable = await getViewableArtifact(publicId, "agent-owner");
    expect(viewable?.view.content).toBe("agent notes");
    expect(viewable?.canEdit).toBe(true);
    expect(viewable?.actsForAuthor).toBe(true);
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should refuse an agent's private artifact when the viewer is not the person who added the agent", async () => {
    // A teammate, the owner of another agent, another agent, or an owner who left the team: the owner join finds no row.
    for (const viewer of ["teammate", "other-agent-owner", "sibling-agent", "former-member-owner"]) {
      mocks.rows = [[row("private", true, false)]];
      await expect(getArtifactAccess(publicId, viewer)).resolves.toBeNull();
    }
  });

  it("should never mark the author as acting for itself when the author opens its own artifact", async () => {
    mocks.rows = [[row("private", false, true)]];
    const access = await getArtifactAccess(publicId, author);
    expect(access?.actsForAuthor).toBe(false);
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
    expect(access?.served.icon).toBe("🚀");
    expect(access?.version.source).toBe("approved");
    expect(mocks.cachedView).not.toHaveBeenCalled();
  });

  it("should keep an unapproved icon from a reader outside the team when a link artifact has a pending edit", async () => {
    mocks.rows = [[row("link", false)]];
    const viewable = await getViewableArtifact(publicId, "outsider");
    expect(viewable?.view.icon).toBe("🚀");
    expect(viewable?.served.icon).toBe("🚀");
  });

  it("should show readers outside the team the approved version's agent, never the agent of the pending edit", async () => {
    for (const viewer of [null, "outsider"]) {
      mocks.rows = [[row("link", false)]];
      const access = await getArtifactAccess(publicId, viewer);
      expect(access?.served.harness).toBe("claude-code");
    }
  });

  it("should show no agent to readers outside the team when the approved version was saved in the browser", async () => {
    mocks.rows = [[{ ...row("public", false), approvedHarness: null }]];
    expect((await getArtifactAccess(publicId, "outsider"))?.served.harness).toBeNull();
  });

  it("should show the artifact's own choice of agent to every reader", async () => {
    const chosen = row("link", false);
    mocks.rows = [[{ ...chosen, record: { ...chosen.record, harnessOverride: "codex" } }]];
    expect((await getArtifactAccess(publicId, "outsider"))?.served.harness).toBe("codex");
  });

  it("should show the author the latest agent when a link artifact has a pending edit", async () => {
    mocks.rows = [[row("link", false)]];
    expect((await getArtifactAccess(publicId, author))?.served.harness).toBe("cursor");
  });

  it("should show the latest icon to the author when a link artifact has a pending edit", async () => {
    mocks.rows = [[row("link", false)], [{ content: "latest" }], []];
    const viewable = await getViewableArtifact(publicId, author);
    expect(viewable?.view.icon).toBe("tabler:bug");
  });

  it("should keep an unapproved cover from readers outside the team when a link artifact has a pending edit", async () => {
    for (const viewer of [null, "outsider"]) {
      mocks.rows = [[row("link", false)]];
      const viewable = await getViewableArtifact(publicId, viewer);
      expect(viewable?.view.cover).toBe("mist");
      expect(viewable?.served.cover).toBe("mist");
    }
  });

  it("should show the latest cover to the author and team members when an edit waits for approval", async () => {
    mocks.rows = [[row("link", false)], [{ content: "latest" }], []];
    const viewable = await getViewableArtifact(publicId, author);
    expect(viewable?.view.cover).toBe("file:0f8fad5b-d9cb-469f-a165-70867728950e@20");
  });

  it("should answer not found when the artifact does not exist", async () => {
    mocks.rows = [[]];
    await expect(getViewableArtifact(publicId, null)).resolves.toBeNull();
  });
});
