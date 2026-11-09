import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HarnessId } from "@/lib/harness/harnesses";

/*
 * The actions behind "Made with" and the Connections page select: signed-in
 * people only, known harness ids only, and the connection always belongs to
 * the session's person, never to an id the page sent. Stores are mocked.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  setArtifactHarnessOverride: vi.fn(),
  setConnectionHarnessOverride: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/harness/artifact-harness-store", () => ({ setArtifactHarnessOverride: mocks.setArtifactHarnessOverride }));
vi.mock("@/lib/harness/connection-store", () => ({ setConnectionHarnessOverride: mocks.setConnectionHarnessOverride }));

const { setArtifactHarnessAction, setConnectionHarnessAction } = await import("./harness-actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.setConnectionHarnessOverride.mockResolvedValue(true);
});

describe("setArtifactHarnessAction", () => {
  it("should refuse and change nothing when nobody is signed in", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await setArtifactHarnessAction("artifact-1", "cursor")).success).toBe(false);
    expect(mocks.setArtifactHarnessOverride).not.toHaveBeenCalled();
  });

  it("should refuse a harness id it does not know", async () => {
    expect((await setArtifactHarnessAction("artifact-1", "<script>" as HarnessId)).success).toBe(false);
    expect(mocks.setArtifactHarnessOverride).not.toHaveBeenCalled();
  });

  it("should say not found when the person may not edit the artifact", async () => {
    mocks.setArtifactHarnessOverride.mockResolvedValue(undefined);
    expect(await setArtifactHarnessAction("artifact-1", "cursor")).toEqual({ success: false, error: "Artifact not found, or you cannot edit it." });
  });

  it("should save as the signed-in person when they may edit it", async () => {
    mocks.setArtifactHarnessOverride.mockResolvedValue({ publicId: "4fXkP9qR2sT7vW1yZ3aB5c", harness: { id: "cursor", stamped: "codex", overridden: true } });
    const result = await setArtifactHarnessAction("artifact-1", "cursor");
    expect(mocks.setArtifactHarnessOverride).toHaveBeenCalledWith("user-1", "artifact-1", "cursor");
    expect(result).toEqual({ success: true, data: { id: "cursor", stamped: "codex", overridden: true } });
  });
});

describe("setConnectionHarnessAction", () => {
  it("should act for the signed-in person whatever the page sends", async () => {
    await setConnectionHarnessAction({ kind: "oauth", clientId: "app-1" }, "claude-code");
    expect(mocks.setConnectionHarnessOverride).toHaveBeenCalledWith({ kind: "oauth", userId: "user-1", clientId: "app-1" }, "claude-code");
  });

  it("should say not found when the connection is not the person's", async () => {
    mocks.setConnectionHarnessOverride.mockResolvedValue(false);
    expect(await setConnectionHarnessAction({ kind: "api-token", tokenId: "token-9" }, null)).toEqual({ success: false, error: "Could not find that connection." });
  });

  it("should refuse a malformed connection without touching storage", async () => {
    expect((await setConnectionHarnessAction({ kind: "oauth", clientId: "" }, "codex")).success).toBe(false);
    expect(mocks.setConnectionHarnessOverride).not.toHaveBeenCalled();
  });
});
