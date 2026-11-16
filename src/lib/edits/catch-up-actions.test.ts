import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * "Did it move on?" from an open editor: only a signed-in person who may
 * edit the artifact gets the newer save, the content is read only when the
 * artifact moved on, and the runaway limit comes first. The session, the
 * access checks, the rate limit, and the stores are mocked at their
 * boundaries.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getEditableArtifactMeta: vi.fn(),
  getEditableArtifact: vi.fn(),
  hitRateLimit: vi.fn(),
  toArtifactDtos: vi.fn(),
  lastSavedBy: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getEditableArtifactMeta: mocks.getEditableArtifactMeta, getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: mocks.hitRateLimit }));
vi.mock("@/lib/artifacts", () => ({ toArtifactDtos: mocks.toArtifactDtos }));
vi.mock("./agent-write-guard", () => ({ lastSavedBy: mocks.lastSavedBy }));

const { catchUpAction } = await import("./catch-up-actions");

const artifactId = "artifact-1";
const shown = "2026-11-16T10:00:00.000Z";
const later = new Date("2026-11-16T10:05:00.000Z");
const dto = { id: artifactId, content: "{}" };
const changedBy = { handle: "ann", harness: { id: "claude-code", name: "Claude Code" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "ann" } });
  mocks.hitRateLimit.mockResolvedValue({ allowed: true });
  mocks.getEditableArtifactMeta.mockResolvedValue({ id: artifactId, updatedAt: later });
  mocks.getEditableArtifact.mockResolvedValue({ id: artifactId, updatedAt: later, content: "{}" });
  mocks.toArtifactDtos.mockResolvedValue([dto]);
  mocks.lastSavedBy.mockResolvedValue(changedBy);
});

describe("catchUpAction", () => {
  it("should return the newer save and who made it when the artifact moved on", async () => {
    await expect(catchUpAction(artifactId, shown)).resolves.toEqual({ success: true, data: { artifact: dto, changedBy } });
    expect(mocks.getEditableArtifactMeta).toHaveBeenCalledWith("ann", artifactId);
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("ann", { id: artifactId });
    expect(mocks.toArtifactDtos).toHaveBeenCalledWith([expect.objectContaining({ id: artifactId })], "ann");
    expect(mocks.hitRateLimit).toHaveBeenCalledWith("catchUp", "ann");
  });

  it("should return nothing, and read no content, when the editor already shows the newest save", async () => {
    mocks.getEditableArtifactMeta.mockResolvedValue({ id: artifactId, updatedAt: new Date(shown) });
    await expect(catchUpAction(artifactId, shown)).resolves.toEqual({ success: true, data: null });
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
    expect(mocks.toArtifactDtos).not.toHaveBeenCalled();
  });

  it("should return nothing when the editor's save is the newer one", async () => {
    mocks.getEditableArtifactMeta.mockResolvedValue({ id: artifactId, updatedAt: new Date("2026-11-16T09:00:00.000Z") });
    await expect(catchUpAction(artifactId, shown)).resolves.toEqual({ success: true, data: null });
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
  });

  it("should give nothing to a person who may not edit the artifact", async () => {
    mocks.getEditableArtifactMeta.mockResolvedValue(null);
    const result = await catchUpAction(artifactId, shown);
    expect(result).toEqual({ success: false, error: "Artifact not found." });
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
    expect(mocks.toArtifactDtos).not.toHaveBeenCalled();
  });

  it("should give nothing when the person lost edit access between the two reads", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    expect((await catchUpAction(artifactId, shown)).success).toBe(false);
    expect(mocks.toArtifactDtos).not.toHaveBeenCalled();
  });

  it("should read nothing when nobody is signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await catchUpAction(artifactId, shown)).success).toBe(false);
    expect(mocks.hitRateLimit).not.toHaveBeenCalled();
    expect(mocks.getEditableArtifactMeta).not.toHaveBeenCalled();
  });

  it("should answer nothing newer, and read nothing, when the person is over the runaway limit", async () => {
    mocks.hitRateLimit.mockResolvedValue({ allowed: false });
    await expect(catchUpAction(artifactId, shown)).resolves.toEqual({ success: true, data: null });
    expect(mocks.getEditableArtifactMeta).not.toHaveBeenCalled();
  });

  it("should read nothing when the id is empty or the time is not a time", async () => {
    expect((await catchUpAction("  ", shown)).success).toBe(false);
    expect((await catchUpAction(artifactId, "yesterday")).success).toBe(false);
    expect(mocks.getEditableArtifactMeta).not.toHaveBeenCalled();
  });
});
