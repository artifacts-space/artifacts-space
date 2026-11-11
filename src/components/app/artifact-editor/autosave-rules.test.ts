import { describe, expect, it } from "vitest";

import { rateLimits } from "@/lib/abuse/limits";
import { EDIT_SESSION_IDLE_MS } from "@/lib/versions/history-rules";

import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_MIN_INTERVAL_MS,
  changedFields,
  closedSession,
  draftProblem,
  hasChanges,
  keepMineOver,
  mergeDrafts,
  nextSaveDelay,
  sessionStep,
  type EditSession,
} from "./autosave-rules";
import type { ArtifactDraft } from "./use-artifact-draft";

const base: ArtifactDraft = { title: "Plan", icon: null, summary: "", content: "# Plan\n\nShip it.", language: "", kind: "markdown" };
const edited = (changes: Partial<ArtifactDraft>): ArtifactDraft => ({ ...base, ...changes });

describe("changedFields", () => {
  it("should send only the fields the editor changed when one field differs", () => {
    expect(changedFields(base, edited({ title: "Launch plan" }))).toEqual({ title: "Launch plan" });
  });

  it("should send nothing when the draft matches the base", () => {
    expect(changedFields(base, { ...base })).toEqual({});
    expect(hasChanges(base, { ...base })).toBe(false);
  });
});

describe("draftProblem", () => {
  it("should hold the save when the title is empty", () => {
    expect(draftProblem(edited({ title: "  " }))).toBe("Add a title to save.");
  });

  it("should hold the save when the content is empty, except for files", () => {
    expect(draftProblem(edited({ content: "" }))).toBe("Add some content to save.");
    expect(draftProblem(edited({ kind: "file", content: "" }))).toBeNull();
  });

  it("should let a page whose stored body is empty go back to empty Markdown", () => {
    const storedEmpty = edited({ kind: "file", content: "" });
    expect(draftProblem(edited({ content: "" }), storedEmpty)).toBeNull();
  });

  it("should hold the save when a body with content is emptied", () => {
    expect(draftProblem(edited({ content: "" }), base)).toBe("Add some content to save.");
    expect(draftProblem(edited({ kind: "file", content: "" }), edited({ kind: "file", content: "Notes" }))).toBeNull();
    expect(draftProblem(edited({ content: "" }), edited({ kind: "file", content: "Notes" }))).toBe("Add some content to save.");
  });

  it("should hold the save when a ui spec does not pass the same check agents' specs do", () => {
    expect(draftProblem(edited({ kind: "ui", content: "{\"root\":\"a\",\"elements\":{}}" }))).toMatch(/^Not saved yet: /);
  });

  it("should not hold a title change for the content when the content and format are unchanged", () => {
    const empty = edited({ content: "" });
    expect(draftProblem({ ...empty, title: "Plan B" }, empty)).toBeNull();
  });

  it("should still hold the save when it empties the content of a saved artifact", () => {
    expect(draftProblem(edited({ content: "" }), base)).toBe("Add some content to save.");
  });

  it("should still check the content when the format changes", () => {
    expect(draftProblem(edited({ kind: "json" }), base)).toMatch(/^Not saved yet: /);
  });

  it("should allow the save when the content fits its format", () => {
    expect(draftProblem(edited({ kind: "json", content: "{\"ok\":true}" }))).toBeNull();
  });
});

describe("sessionStep", () => {
  const now = 1_000_000_000;

  it("should start a session when the editor has not saved yet", () => {
    expect(sessionStep(closedSession, now)).toBe("start");
  });

  it("should continue the session when the last save was moments ago", () => {
    expect(sessionStep({ open: true, lastSavedAt: now - 2_000 }, now)).toBe("continue");
  });

  it("should start a new session when the editor was idle past the idle limit", () => {
    expect(sessionStep({ open: true, lastSavedAt: now - EDIT_SESSION_IDLE_MS - 1 }, now)).toBe("start");
  });

  it("should start a new session when someone else's save closed the session", () => {
    expect(sessionStep({ open: false, lastSavedAt: now - 2_000 }, now)).toBe("start");
  });
});

describe("mergeDrafts", () => {
  it("should merge when the editor and the other save changed different fields", () => {
    const outcome = mergeDrafts(base, edited({ content: "# Plan\n\nShip it Friday." }), edited({ title: "Launch plan" }));
    expect(outcome).toEqual({ kind: "merged", draft: edited({ title: "Launch plan", content: "# Plan\n\nShip it Friday." }) });
  });

  it("should merge when both made the same change", () => {
    expect(mergeDrafts(base, edited({ title: "Same" }), edited({ title: "Same" }))).toEqual({ kind: "merged", draft: edited({ title: "Same" }) });
  });

  it("should report a conflict and merge nothing when both changed the same field differently", () => {
    const outcome = mergeDrafts(base, edited({ content: "Mine" }), edited({ content: "Theirs", title: "Theirs too" }));
    expect(outcome).toEqual({ kind: "conflict", fields: ["content"] });
  });
});

describe("keepMineOver", () => {
  it("should keep the editor's changes and their changes to other fields when the editor keeps theirs out of a conflict", () => {
    const kept = keepMineOver(base, edited({ content: "Mine" }), edited({ content: "Theirs", title: "Their title" }));
    expect(kept).toEqual(edited({ content: "Mine", title: "Their title" }));
  });
});

describe("nextSaveDelay", () => {
  it("should save a second after typing stops when the last save was long ago", () => {
    expect(nextSaveDelay({ now: 60_000, pendingSince: 60_000, lastSaveAt: 0 })).toBe(AUTOSAVE_DELAY_MS);
  });

  it("should save no later than the max wait after the oldest unsaved change when typing goes on", () => {
    expect(nextSaveDelay({ now: 4_500, pendingSince: 0, lastSaveAt: null })).toBe(AUTOSAVE_MAX_WAIT_MS - 4_500);
  });

  it("should wait out the minimum interval when the last save was moments ago", () => {
    expect(nextSaveDelay({ now: 10_000, pendingSince: 10_000, lastSaveAt: 9_000 })).toBe(AUTOSAVE_MIN_INTERVAL_MS - 1_000);
  });

  it("should resend a merged draft a second later even when the last save was moments ago", () => {
    expect(nextSaveDelay({ now: 10_000, pendingSince: 10_000, lastSaveAt: 9_900, resend: true })).toBe(AUTOSAVE_DELAY_MS);
  });

  it("should save at once when the max wait has passed and the last save is old enough", () => {
    expect(nextSaveDelay({ now: 20_000, pendingSince: 0, lastSaveAt: 0 })).toBe(0);
  });
});

/** Runs the autosave timer over a list of change times and returns when each save went, and which session step it sent. */
function simulateAutosave(changeTimes: readonly number[]) {
  const saves: { at: number; step: ReturnType<typeof sessionStep> }[] = [];
  let session: EditSession = closedSession;
  let pendingSince: number | null = null;
  let lastSaveAt: number | null = null;
  let timerAt: number | null = null;
  let next = 0;
  while (next < changeTimes.length || timerAt !== null) {
    const change = changeTimes[next] ?? Number.POSITIVE_INFINITY;
    if (timerAt !== null && timerAt <= change) {
      saves.push({ at: timerAt, step: sessionStep(session, timerAt) });
      session = { open: true, lastSavedAt: timerAt };
      lastSaveAt = timerAt;
      pendingSince = null;
      timerAt = null;
      continue;
    }
    next += 1;
    pendingSince ??= change;
    timerAt = change + nextSaveDelay({ now: change, pendingSince, lastSaveAt });
  }
  return saves;
}

describe("autosave over an hour of typing", () => {
  const hourMs = 3_600_000;
  // The worst case for a plain debounce: bursts of 8 keystrokes 150 ms apart, each followed by a pause just over the 1 s delay.
  const keystrokes: number[] = [];
  for (let at = 0; at < hourMs; at += keystrokes.length % 8 === 7 ? AUTOSAVE_DELAY_MS + 100 : 150) keystrokes.push(at);
  const saves = simulateAutosave(keystrokes);

  it("should stay well under the autosave cap when someone types without stopping for an hour", () => {
    expect(saves.length).toBeLessThanOrEqual(hourMs / AUTOSAVE_MIN_INTERVAL_MS);
    expect(saves.length).toBeLessThan(rateLimits.artifactAutosave.limit / 4);
  });

  it("should count only the session's first save as an edit when typing never pauses for long", () => {
    const edits = saves.filter((save) => save.step === "start").length;
    expect(edits).toBe(1);
    expect(edits).toBeLessThan(rateLimits.artifactUpdate.limit / 100);
  });

  it("should never leave a change unsaved for longer than the max wait plus the minimum interval", () => {
    const savedAt = saves.map((save) => save.at);
    const longestWait = Math.max(...keystrokes.map((at) => (savedAt.find((saved) => saved >= at) ?? Number.POSITIVE_INFINITY) - at));
    expect(longestWait).toBeLessThanOrEqual(AUTOSAVE_MAX_WAIT_MS + AUTOSAVE_MIN_INTERVAL_MS);
  });
});
