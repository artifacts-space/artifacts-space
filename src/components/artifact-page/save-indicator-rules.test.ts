import { describe, expect, it, vi } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";

import { idleSave, saveIndicatorFor, saveProblem, saveTone } from "./save-indicator-rules";

const someone = fixtureArtifact({ id: "theirs", kind: "markdown", title: "Notes", content: "# Notes" });

describe("saveTone", () => {
  it("should be idle when nothing changed yet", () => {
    expect(saveTone({ kind: "idle" }, false)).toBe("idle");
  });

  it("should be saving when a save is on its way or typing is not sent yet", () => {
    expect(saveTone({ kind: "saving" }, false)).toBe("saving");
    expect(saveTone({ kind: "saved", waitingForApproval: false }, true)).toBe("saving");
    expect(saveTone({ kind: "idle" }, true)).toBe("saving");
  });

  it("should be saved when the latest change is stored", () => {
    expect(saveTone({ kind: "saved", waitingForApproval: true }, false)).toBe("saved");
  });

  it("should be a problem when a save is held, failed, or in conflict", () => {
    expect(saveTone({ kind: "held", message: "Not saved yet." }, true)).toBe("problem");
    expect(saveTone({ kind: "failed", message: "Not saved." }, true)).toBe("problem");
    expect(saveTone({ kind: "conflict", theirs: someone, base: someone }, true)).toBe("problem");
  });
});

describe("saveIndicatorFor", () => {
  it("should offer to try again only when a save failed", () => {
    const retry = vi.fn();
    expect(saveIndicatorFor({ kind: "failed", message: "Not saved. Check your connection." }, true, retry)).toEqual({ tone: "problem", label: "Not saved. Check your connection.", onRetry: retry });
    expect(saveIndicatorFor({ kind: "held", message: "Not saved yet. Fix the JSON." }, true, retry).onRetry).toBeNull();
    expect(saveIndicatorFor({ kind: "saving" }, true, retry).onRetry).toBeNull();
  });

  it("should use the editor's words for each status", () => {
    const retry = vi.fn();
    expect(saveIndicatorFor({ kind: "saved", waitingForApproval: false }, false, retry).label).toBe("Saved");
    expect(saveIndicatorFor({ kind: "saving" }, true, retry).label).toBe("Saving…");
    expect(saveIndicatorFor({ kind: "idle" }, false, retry)).toEqual(idleSave);
  });
});

describe("saveProblem", () => {
  it("should show the message as a problem with nothing to retry when editing cannot start", () => {
    expect(saveProblem("Editing is not available right now.")).toEqual({ tone: "problem", label: "Editing is not available right now.", onRetry: null });
  });
});
