import { describe, expect, it } from "vitest";

import { EDIT_SIGNAL_INTERVAL_MS } from "@/lib/edits/edit-conflict-rules";

import { createEditingSignalTracker } from "./editing-signal-tracker";

describe("createEditingSignalTracker", () => {
  it("should signal when the person types, then not again within the signal interval", () => {
    const tracker = createEditingSignalTracker();
    expect(tracker.onDraftChange(1_000, true)).toBe(true);
    expect(tracker.onDraftChange(2_000, true)).toBe(false);
    expect(tracker.onDraftChange(1_000 + EDIT_SIGNAL_INTERVAL_MS, true)).toBe(true);
  });

  it("should never signal when a draft only loads the saved artifact", () => {
    expect(createEditingSignalTracker().onDraftChange(1_000, false)).toBe(false);
  });

  it("should say it took a lease when the editor leaves after signalling, and not when it never signalled", () => {
    const typed = createEditingSignalTracker();
    typed.onDraftChange(1_000, true);
    expect(typed.onLeave()).toBe(true);
    expect(createEditingSignalTracker().onLeave()).toBe(false);
  });

  it("should take no lease on the next artifact when the editor moves there right after typing", () => {
    const tracker = createEditingSignalTracker();
    tracker.onDraftChange(1_000, true);
    tracker.onLeave();
    // The next artifact's draft loads (nothing unsaved) a second later: that is not typing there.
    expect(tracker.onDraftChange(2_000, false)).toBe(false);
    // Typing in it does signal, at once.
    expect(tracker.onDraftChange(3_000, true)).toBe(true);
  });
});
