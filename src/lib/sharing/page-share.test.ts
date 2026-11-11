import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingRequests } from "@/lib/artifacts";
import type { TeamMembership } from "@/lib/teams/queries";

const mocks = vi.hoisted(() => ({
  pendingRequestsFor: vi.fn<(ids: string[]) => Promise<Map<string, PendingRequests>>>(),
  listTeamsForUser: vi.fn<(userId: string) => Promise<TeamMembership[]>>(),
}));

// The database reads are the boundary: the open requests and the viewer's teams.
vi.mock("@/lib/artifacts", () => ({ pendingRequestsFor: mocks.pendingRequestsFor }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: mocks.listTeamsForUser }));

const { loadPageShare, sharesOnPage, toShareableArtifact } = await import("./page-share");

const author = "author-1";
const record = {
  id: "artifact-1",
  publicId: "4fXkP9qR2sT7vW1yZ3aB5c",
  userId: author,
  title: "Release plan",
  icon: null,
  visibility: "team" as const,
  teamId: "team-1",
  comments: "team" as const,
  showInSearch: true,
};
const pendingSharing = { requestId: "request-1", level: "public" as const, teamId: "team-1", comments: null, requestedAt: "2026-11-11T12:00:00.000Z" };

beforeEach(() => {
  mocks.pendingRequestsFor.mockReset().mockResolvedValue(new Map([[record.id, { sharing: pendingSharing, edit: null, comments: null }]]));
  mocks.listTeamsForUser.mockReset().mockResolvedValue([]);
});

describe("sharesOnPage", () => {
  it("should give the author Share when they open their own artifact", () => {
    expect(sharesOnPage({ record, actsForAuthor: false }, author)).toBe(true);
  });

  it("should give Share to the person who added the agent when they act for its author", () => {
    expect(sharesOnPage({ record, actsForAuthor: true }, "agent-owner")).toBe(true);
  });

  const readers: Record<string, string | null> = {
    signedOut: null,
    teammateWhoMayEdit: "teammate",
    teamOwnerOrAdmin: "team-admin",
    linkOrPublicReader: "stranger",
  };
  for (const [name, viewerId] of Object.entries(readers)) {
    it(`should keep the read-only status for ${name} when they are not the author`, () => {
      expect(sharesOnPage({ record, actsForAuthor: false }, viewerId)).toBe(false);
    });
  }
});

describe("loadPageShare", () => {
  it("should load nothing and return null when the viewer may not share", async () => {
    await expect(loadPageShare({ record, actsForAuthor: false }, "teammate")).resolves.toBeNull();
    await expect(loadPageShare({ record, actsForAuthor: false }, null)).resolves.toBeNull();
    expect(mocks.pendingRequestsFor).not.toHaveBeenCalled();
    expect(mocks.listTeamsForUser).not.toHaveBeenCalled();
  });

  it("should load the open requests and the sharer's own teams when the author opens it", async () => {
    const share = await loadPageShare({ record, actsForAuthor: false }, author);
    expect(mocks.listTeamsForUser).toHaveBeenCalledWith(author);
    expect(mocks.pendingRequestsFor).toHaveBeenCalledWith([record.id]);
    expect(share?.artifact.pendingSharing).toEqual(pendingSharing);
    expect(share?.artifact.visibility).toBe("team");
  });
});

describe("toShareableArtifact", () => {
  it("should carry no content or author when it maps a row", () => {
    const dto = toShareableArtifact(record, { sharing: null, edit: null, comments: null });
    expect(Object.keys(dto).sort()).toEqual(["comments", "icon", "id", "pendingComments", "pendingEdit", "pendingSharing", "publicId", "showInSearch", "teamId", "title", "visibility"]);
  });

  it("should turn Show in search engines off when the artifact is not public", () => {
    expect(toShareableArtifact(record, { sharing: null, edit: null, comments: null }).showInSearch).toBe(false);
    expect(toShareableArtifact({ ...record, visibility: "public" }, { sharing: null, edit: null, comments: null }).showInSearch).toBe(true);
  });
});
