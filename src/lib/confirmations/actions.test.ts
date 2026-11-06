import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  skipConfirmation: vi.fn(),
  resetConfirmations: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("./store", () => ({ skipConfirmation: mocks.skipConfirmation, resetConfirmations: mocks.resetConfirmations }));

const { resetConfirmationsAction, skipConfirmationAction } = await import("./actions");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
});

describe("skipConfirmationAction", () => {
  it("should save the skip for the signed-in user when the action is known", async () => {
    mocks.skipConfirmation.mockResolvedValue("deleteArtifact");
    await expect(skipConfirmationAction("deleteArtifact")).resolves.toEqual({ success: true, data: "deleteArtifact" });
    expect(mocks.skipConfirmation).toHaveBeenCalledWith("user-1", "deleteArtifact");
  });

  it("should fail without saving when nobody is signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await skipConfirmationAction("deleteArtifact");
    expect(result.success).toBe(false);
    expect(mocks.skipConfirmation).not.toHaveBeenCalled();
  });

  it("should return the validation message when the action is unknown", async () => {
    mocks.skipConfirmation.mockRejectedValue(new ZodError([{ code: "custom", message: "Unknown confirmation.", path: [], input: "x" }]));
    await expect(skipConfirmationAction("x")).resolves.toEqual({ success: false, error: "Unknown confirmation." });
  });
});

describe("resetConfirmationsAction", () => {
  it("should reset the signed-in user's confirmations when signed in", async () => {
    await expect(resetConfirmationsAction()).resolves.toEqual({ success: true, data: null });
    expect(mocks.resetConfirmations).toHaveBeenCalledWith("user-1");
  });

  it("should fail without resetting when nobody is signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await resetConfirmationsAction();
    expect(result.success).toBe(false);
    expect(mocks.resetConfirmations).not.toHaveBeenCalled();
  });

  it("should return a generic message when the database fails", async () => {
    mocks.resetConfirmations.mockRejectedValue(new Error("connection lost"));
    await expect(resetConfirmationsAction()).resolves.toEqual({ success: false, error: "Could not turn confirmations back on." });
  });
});
