import { beforeEach, describe, expect, it, vi } from "vitest";

/* loadArtifactForViewer: what MCP artifacts_get and the workspace get. Readers outside the team never get a project or tags. */

const mocks = vi.hoisted(() => ({ getViewableArtifact: vi.fn(), toArtifactDtos: vi.fn(), lastEditorsFor: vi.fn(), filesForViewer: vi.fn() }));
vi.mock("@/lib/access", () => ({ getViewableArtifact: mocks.getViewableArtifact }));
vi.mock("@/lib/artifacts", () => ({ toArtifactDtos: mocks.toArtifactDtos, lastEditorsFor: mocks.lastEditorsFor }));
vi.mock("@/lib/files/download", () => ({ filesForViewer: mocks.filesForViewer }));

const { loadArtifactForViewer } = await import("./artifact-read");

const savedAt = new Date("2026-11-07T00:00:00Z");

function viewable(canEdit: boolean) {
  return {
    record: { id: "a1", publicId: "pub", userId: "author", visibility: "link", teamId: "acme", projectId: "p1" },
    canEdit,
    view: { title: "Plan", icon: null, theme: "team:acme-q3-launch-x7k2p9", summary: "", content: "Body", kind: "markdown", language: "", source: "", metadata: {}, updatedAt: savedAt, editedBy: null },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.toArtifactDtos.mockResolvedValue([{ id: "a1", project: { id: "p1", name: "Billing", icon: null }, tags: ["launch"] }]);
  mocks.lastEditorsFor.mockResolvedValue(new Map());
  mocks.filesForViewer.mockResolvedValue([]);
});

describe("loadArtifactForViewer", () => {
  it("should include the project when the viewer may edit the artifact", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable(true));
    const loaded = await loadArtifactForViewer("pub", "author");
    expect(loaded?.dto.project).toEqual({ id: "p1", name: "Billing", icon: null });
    expect(loaded?.dto.tags).toEqual(["launch"]);
    expect(mocks.toArtifactDtos).toHaveBeenCalledWith([expect.objectContaining({ id: "a1" })], "author");
  });

  it("should drop the project and tags when a reader outside the team opens a link artifact", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable(false));
    const loaded = await loadArtifactForViewer("pub", "stranger");
    expect(loaded?.dto.project).toBeNull();
    expect(loaded?.dto.tags).toEqual([]);
  });

  it("should hide the team preset id from a reader outside the team and keep it for the team", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable(false));
    const outsider = await loadArtifactForViewer("pub", "stranger");
    expect(outsider?.dto.theme).toBe("custom");
    expect(JSON.stringify(outsider?.dto)).not.toContain("acme-q3-launch");
    mocks.getViewableArtifact.mockResolvedValue(viewable(true));
    expect((await loadArtifactForViewer("pub", "author"))?.dto.theme).toBe("team:acme-q3-launch-x7k2p9");
  });
});
