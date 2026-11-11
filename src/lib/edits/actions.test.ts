import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The web editor's "I'm editing" signal: only a signed-in person who may edit
 * the artifact starts a lease, within the runaway limit. The session, the
 * access check, the rate limit, and the lease store are mocked at their
 * boundaries.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getEditableArtifact: vi.fn(),
  hitRateLimit: vi.fn(),
  renewEditLease: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: mocks.hitRateLimit }));
vi.mock("./agent-write-guard", () => ({ renewEditLease: mocks.renewEditLease }));

const { signalEditingAction } = await import("./actions");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "ann" } });
  mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", publicId });
  mocks.hitRateLimit.mockResolvedValue({ allowed: true });
  mocks.renewEditLease.mockResolvedValue(undefined);
});

describe("signalEditingAction", () => {
  it("should renew the person's lease when they may edit the artifact", async () => {
    await expect(signalEditingAction(publicId)).resolves.toEqual({ success: true, data: null });
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("ann", { publicId });
    expect(mocks.renewEditLease).toHaveBeenCalledWith("artifact-1", "ann");
    expect(mocks.hitRateLimit).toHaveBeenCalledWith("editLease", "ann");
  });

  it("should write no lease when nobody is signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await signalEditingAction(publicId)).success).toBe(false);
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should write no lease when the person may not edit the artifact", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    expect((await signalEditingAction(publicId)).success).toBe(false);
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should write no lease when the id is not an artifact id", async () => {
    expect((await signalEditingAction("not an id")).success).toBe(false);
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });

  it("should drop the signal when the runaway limit is reached", async () => {
    mocks.hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await signalEditingAction(publicId)).success).toBe(false);
    expect(mocks.renewEditLease).not.toHaveBeenCalled();
  });
});
