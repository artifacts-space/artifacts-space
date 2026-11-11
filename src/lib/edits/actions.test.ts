import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The web editor's "I'm editing" signal: only a signed-in person who may edit
 * the artifact starts a lease, within the runaway limit. The session, the
 * access check, the rate limit, and the lease store are mocked at their
 * boundaries.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getEditableArtifactMeta: vi.fn(),
  hitRateLimit: vi.fn(),
  renewEditLease: vi.fn(),
  endEditLease: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getEditableArtifactMeta: mocks.getEditableArtifactMeta }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: mocks.hitRateLimit }));
vi.mock("./agent-write-guard", () => ({ renewEditLease: mocks.renewEditLease, endEditLease: mocks.endEditLease }));

const { signalEditingAction } = await import("./actions");

const artifactId = "artifact-1";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "ann" } });
  mocks.getEditableArtifactMeta.mockResolvedValue({ id: artifactId });
  mocks.hitRateLimit.mockResolvedValue({ allowed: true });
  mocks.renewEditLease.mockResolvedValue(undefined);
  mocks.endEditLease.mockResolvedValue(undefined);
});

describe("signalEditingAction", () => {
  it("should renew the person's lease when they may edit the artifact", async () => {
    await expect(signalEditingAction(artifactId)).resolves.toEqual({ success: true, data: null });
    expect(mocks.getEditableArtifactMeta).toHaveBeenCalledWith("ann", artifactId);
    expect(mocks.renewEditLease).toHaveBeenCalledWith("artifact-1", "ann");
    expect(mocks.hitRateLimit).toHaveBeenCalledWith("editLease", "ann");
  });

  it("should write no lease when nobody is signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await signalEditingAction(artifactId)).success).toBe(false);
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should write no lease when the person may not edit the artifact", async () => {
    mocks.getEditableArtifactMeta.mockResolvedValue(null);
    expect((await signalEditingAction(artifactId)).success).toBe(false);
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should write no lease when the id is empty", async () => {
    expect((await signalEditingAction("  ")).success).toBe(false);
    expect(mocks.getEditableArtifactMeta).not.toHaveBeenCalled();
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should renew no lease, and still answer success, when the runaway limit is reached", async () => {
    mocks.hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect(await signalEditingAction(artifactId)).toEqual({ success: true, data: null });
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should end the person's lease when their editor closes", async () => {
    await expect(signalEditingAction(artifactId, false)).resolves.toEqual({ success: true, data: null });
    expect(mocks.endEditLease).toHaveBeenCalledWith("artifact-1", "ann");
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should end no lease when the person may not edit the artifact", async () => {
    mocks.getEditableArtifactMeta.mockResolvedValue(null);
    expect((await signalEditingAction(artifactId, false)).success).toBe(false);
    expect(mocks.endEditLease).not.toHaveBeenCalled();
  });
});
