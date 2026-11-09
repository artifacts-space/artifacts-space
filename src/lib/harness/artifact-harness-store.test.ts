import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Changing one artifact's harness from its menu: only people who may edit it
 * can, and the change is a label: no version, no new save time, no editor.
 */

const mocks = vi.hoisted(() => ({
  getEditableArtifact: vi.fn(),
  set: vi.fn(),
  enforceRateLimit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.set(values);
        return { where: () => Promise.resolve() };
      },
    }),
  }),
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

const { setArtifactHarnessOverride } = await import("./artifact-harness-store");

const record = { id: "artifact-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", harness: "codex", harnessOverride: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditableArtifact.mockResolvedValue(record);
});

describe("setArtifactHarnessOverride", () => {
  it("should refuse and write nothing when the person may not edit the artifact", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    await expect(setArtifactHarnessOverride("stranger", "artifact-1", "cursor")).resolves.toBeUndefined();
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("stranger", { id: "artifact-1" });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should set only the override when an editor changes it", async () => {
    const saved = await setArtifactHarnessOverride("teammate", "artifact-1", "cursor");
    expect(mocks.set).toHaveBeenCalledWith({ harnessOverride: "cursor" });
    expect(saved).toEqual({ publicId: record.publicId, harness: { id: "cursor", stamped: "codex", overridden: true } });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("harnessChoice", "teammate");
  });

  it("should go back to what was detected when the editor clears it", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ ...record, harnessOverride: "cursor" });
    const saved = await setArtifactHarnessOverride("author", "artifact-1", null);
    expect(mocks.set).toHaveBeenCalledWith({ harnessOverride: null });
    expect(saved?.harness).toEqual({ id: "codex", stamped: "codex", overridden: false });
  });

  it("should write nothing when the choice is already saved", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ ...record, harnessOverride: "cursor" });
    await setArtifactHarnessOverride("author", "artifact-1", "cursor");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
