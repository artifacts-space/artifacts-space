import { beforeEach, describe, expect, it, vi } from "vitest";

import { StaleSaveError } from "@/lib/save-guard";

/*
 * The web editor's save action: every save must name the version its draft
 * is based on, a refused save hands back the newest version so the editor can
 * merge or offer a reload, and a person who may not edit gets nothing. The
 * session, the store, and the read are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  saveArtifactUpdate: vi.fn(),
  loadArtifactForViewer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: () => Promise.resolve() }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: mocks.loadArtifactForViewer }));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  listArtifacts: vi.fn(),
  saveArtifactUpdate: mocks.saveArtifactUpdate,
}));

const { updateArtifactAction } = await import("./actions");

const base = "2026-11-08T10:00:00.000Z";
const theirs = { id: "artifact-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", title: "Plan", content: "# Theirs", updatedAt: "2026-11-08T10:01:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("updateArtifactAction", () => {
  it("should refuse a save that names no base version without touching the artifact", async () => {
    const result = await updateArtifactAction("artifact-1", { content: "# Mine" }, {});
    expect(result.success).toBe(false);
    expect(mocks.saveArtifactUpdate).not.toHaveBeenCalled();
  });

  it("should pass the base version and the editing-session step to the store when a person autosaves", async () => {
    mocks.saveArtifactUpdate.mockResolvedValue({ artifact: { ...theirs, content: "# Mine" }, savedOverAgents: false });
    const result = await updateArtifactAction("artifact-1", { content: "# Mine" }, { expectedUpdatedAt: base, session: "continue" });
    expect(result.success).toBe(true);
    expect(mocks.saveArtifactUpdate).toHaveBeenCalledWith("user-1", "artifact-1", { content: "# Mine" }, "person", { expectedUpdatedAt: base, session: "continue" });
  });

  it("should hand back the newest version and overwrite nothing when someone saved since the base version", async () => {
    mocks.saveArtifactUpdate.mockRejectedValue(new StaleSaveError(theirs.publicId));
    mocks.loadArtifactForViewer.mockResolvedValue({ dto: theirs });
    const result = await updateArtifactAction("artifact-1", { content: "# Mine" }, { expectedUpdatedAt: base });
    expect(result).toMatchObject({ success: false, latest: theirs });
    expect(mocks.loadArtifactForViewer).toHaveBeenCalledWith(theirs.publicId, "user-1");
  });

  it("should say the save went over an agent's newer save when the store reports it", async () => {
    mocks.saveArtifactUpdate.mockResolvedValue({ artifact: { ...theirs, content: "# Mine" }, savedOverAgents: true });
    const result = await updateArtifactAction("artifact-1", { content: "# Mine" }, { expectedUpdatedAt: base });
    expect(result).toMatchObject({ success: true, savedOverAgents: true, data: { content: "# Mine" } });
  });

  it("should report not found when the person may not edit the artifact", async () => {
    mocks.saveArtifactUpdate.mockResolvedValue(null);
    const result = await updateArtifactAction("artifact-1", { content: "# Mine" }, { expectedUpdatedAt: base });
    expect(result).toEqual({ success: false, error: "Artifact not found." });
  });
});
