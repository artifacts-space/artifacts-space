import { describe, expect, it, vi } from "vitest";

import { confirmAndRun, requestConfirmation, saveSkip } from "./flow";
import type { ConfirmationAction } from "./kinds";

const skippedDelete: ReadonlySet<ConfirmationAction> = new Set(["deleteArtifact"]);

describe("requestConfirmation", () => {
  it("should run the action with no dialog when the person skipped this confirmation", () => {
    const run = vi.fn(() => Promise.resolve(true));
    const ask = vi.fn();
    expect(requestConfirmation(skippedDelete, "deleteArtifact", run, ask)).toBe("ran");
    expect(run).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });

  it("should open the dialog without running when the confirmation is not skipped", () => {
    const run = vi.fn(() => Promise.resolve(true));
    const ask = vi.fn();
    expect(requestConfirmation(skippedDelete, "leaveTeam", run, ask)).toBe("asked");
    expect(ask).toHaveBeenCalledWith(run);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("confirmAndRun", () => {
  it("should save the skip and run the action when Don't ask again is ticked", async () => {
    const skip = vi.fn();
    const run = vi.fn(() => Promise.resolve(true));
    await expect(confirmAndRun({ action: "revokeToken", dontAskAgain: true, run, skip })).resolves.toBe(true);
    expect(skip).toHaveBeenCalledWith("revokeToken");
    expect(run).toHaveBeenCalledOnce();
  });

  it("should run the action without saving when Don't ask again is not ticked", async () => {
    const skip = vi.fn();
    const run = vi.fn(() => Promise.resolve(false));
    await expect(confirmAndRun({ action: "revokeToken", dontAskAgain: false, run, skip })).resolves.toBe(false);
    expect(skip).not.toHaveBeenCalled();
  });
});

describe("saveSkip", () => {
  function setup(save: () => Promise<{ success: boolean }>) {
    const skipped = new Set<ConfirmationAction>();
    const onError = vi.fn();
    const promise = saveSkip({
      action: "removeAgent",
      add: (action) => { skipped.add(action); },
      remove: (action) => { skipped.delete(action); },
      save,
      onError,
    });
    return { skipped, onError, promise };
  }

  it("should mark the action skipped at once when the save is still running", () => {
    const { skipped } = setup(() => new Promise(() => undefined));
    expect(skipped.has("removeAgent")).toBe(true);
  });

  it("should keep the skip when the save succeeds", async () => {
    const { skipped, onError, promise } = setup(() => Promise.resolve({ success: true }));
    await expect(promise).resolves.toBe(true);
    expect(skipped.has("removeAgent")).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("should undo the skip and report an error when the server refuses it", async () => {
    const { skipped, onError, promise } = setup(() => Promise.resolve({ success: false }));
    await expect(promise).resolves.toBe(false);
    expect(skipped.has("removeAgent")).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("should undo the skip and report an error when the request throws", async () => {
    const { skipped, onError, promise } = setup(() => Promise.reject(new Error("offline")));
    await expect(promise).resolves.toBe(false);
    expect(skipped.has("removeAgent")).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});
