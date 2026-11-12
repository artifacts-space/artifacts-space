import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A restore from the web app is a person's save, so it always names the save
 * the person saw: without that base the write would match on the id alone and
 * land over another person's newer save. The session, access check, and save
 * are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getEditableArtifact: vi.fn(),
  restoreArtifactVersion: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/artifacts", () => ({ restoreArtifactVersion: mocks.restoreArtifactVersion }));
vi.mock("@/lib/public-id", () => ({ isPublicId: () => true }));
vi.mock("@/lib/themes/artifact-theme-context", () => ({ resolveThemeFor: vi.fn() }));
vi.mock("./history-queries", () => ({ getArtifactVersionDetail: vi.fn(), listArtifactVersions: vi.fn() }));

const { restoreVersionAction } = await import("./actions");
const { STALE_SAVE_MESSAGE, StaleSaveError } = await import("@/lib/save-guard");

const versionId = "4f1c8f3e-5b8a-4c56-9a8e-0d3f2b1c7e90";
const seen = "2026-11-11T13:08:00.123Z";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "ann" } });
  mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", publicId: "pub1" });
  mocks.restoreArtifactVersion.mockResolvedValue({ artifact: { id: "artifact-1" }, savedOverAgents: false });
});

describe("restoreVersionAction", () => {
  it("should restore with the save the person saw as its base", async () => {
    const result = await restoreVersionAction("pub1", versionId, seen);
    expect(result).toEqual({ success: true, data: { artifact: { id: "artifact-1" }, savedOverAgents: false } });
    expect(mocks.restoreArtifactVersion).toHaveBeenCalledWith("ann", "artifact-1", versionId, "person", { expectedUpdatedAt: seen });
  });

  it("should tell the person someone saved since when the guarded write refuses the restore", async () => {
    mocks.restoreArtifactVersion.mockRejectedValue(new StaleSaveError("pub1"));
    const result = await restoreVersionAction("pub1", versionId, seen);
    expect(result).toEqual({ success: false, error: STALE_SAVE_MESSAGE });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("should refuse and write nothing when no base is sent", async () => {
    const result = await restoreVersionAction("pub1", versionId, undefined as unknown as string);
    expect(result.success).toBe(false);
    expect(mocks.restoreArtifactVersion).not.toHaveBeenCalled();
  });

  it("should refuse and write nothing when the base is not a timestamp", async () => {
    expect((await restoreVersionAction("pub1", versionId, "yesterday")).success).toBe(false);
    expect(mocks.restoreArtifactVersion).not.toHaveBeenCalled();
  });
});
