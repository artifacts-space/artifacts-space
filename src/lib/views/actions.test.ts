import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadViewStats: vi.fn(),
  getTeamMembershipById: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("./view-stats", () => ({ loadViewStats: mocks.loadViewStats }));
vi.mock("@/lib/teams/queries", () => ({ getTeamMembershipById: mocks.getTeamMembershipById }));

const { getViewStatsAction } = await import("./actions");

const publicId = "AbCdEfGhJkLmNpQrStUvWx";
const stats = { days: 30, counting: true, totals: { views: 3, visitors: 2 }, daily: [], referrers: [] };

describe("getViewStatsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "editor-1" } });
    mocks.loadViewStats.mockResolvedValue(stats);
  });

  it("should return the stats when the reader may edit the artifact", async () => {
    const record = { id: "artifact-1", visibility: "public", userId: "editor-1", teamId: "team-1" };
    mocks.getEditableArtifact.mockResolvedValue(record);
    await expect(getViewStatsAction(publicId, 30)).resolves.toEqual({ success: true, data: stats });
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("editor-1", { publicId });
    expect(mocks.loadViewStats).toHaveBeenCalledWith(record, 30);
  });

  it("should refuse a teammate whose role may not see views, without reading any counts", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", visibility: "public", userId: "author-1", teamId: "team-1" });
    mocks.getTeamMembershipById.mockResolvedValue({ roleKey: "designer", kind: "person", capabilities: ["themes.manage"] });
    await expect(getViewStatsAction(publicId, 30)).resolves.toEqual({ success: false, error: "Artifact not found." });
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });

  it("should return the stats when a teammate's role may see views", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", visibility: "public", userId: "author-1", teamId: "team-1" });
    mocks.getTeamMembershipById.mockResolvedValue({ roleKey: "member", kind: "person", capabilities: ["analytics.view"] });
    await expect(getViewStatsAction(publicId, 30)).resolves.toEqual({ success: true, data: stats });
  });

  it("should refuse a reader who cannot edit the artifact, like a public reader, without reading any counts", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "stranger-1" } });
    mocks.getEditableArtifact.mockResolvedValue(null);
    await expect(getViewStatsAction(publicId, 30)).resolves.toEqual({ success: false, error: "Artifact not found." });
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });

  it("should refuse a signed-out request without looking up the artifact", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await getViewStatsAction(publicId, 30);
    expect(result.success).toBe(false);
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });

  it("should refuse a range other than 30 or 90 days", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", visibility: "public" });
    expect((await getViewStatsAction(publicId, 3650)).success).toBe(false);
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });

  it("should refuse a malformed id without looking it up", async () => {
    expect((await getViewStatsAction("../secret", 30)).success).toBe(false);
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
  });
});
