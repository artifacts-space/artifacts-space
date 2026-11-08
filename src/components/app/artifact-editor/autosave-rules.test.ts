import { describe, expect, it } from "vitest";

import { EDIT_SESSION_IDLE_MS } from "@/lib/versions/history-rules";

import { changedFields, closedSession, draftProblem, hasChanges, mergeDrafts, sessionStep } from "./autosave-rules";
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

  it("should hold the save when a ui spec does not pass the same check agents' specs do", () => {
    expect(draftProblem(edited({ kind: "ui", content: "{\"root\":\"a\",\"elements\":{}}" }))).toMatch(/^Not saved yet: /);
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
