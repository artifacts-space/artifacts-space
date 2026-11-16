import { describe, expect, it } from "vitest";

import { CATCH_UP_GAP_MS, CATCH_UP_STALE_MS, catchesUp, catchUpWords, shouldCatchUp, takesAnswer, type CatchUpCheck, type EditorMoment } from "./catch-up-rules";

const ready: CatchUpCheck = { kind: "canvas", stored: true, visible: true, unsaved: false, running: false, lastStartedAt: null, now: 1_000_000 };
const agent = { handle: "ann", harness: { id: "claude-code" as const, name: "Claude Code" } };
const frames = (names: string[], removed = 0) => ({ changed: names.map((name, index) => ({ id: `frame-${String(index)}`, name })), removed });

describe("catchesUp", () => {
  it("should catch up canvases and interfaces, and leave documents and other formats to a reload", () => {
    expect(["canvas", "ui"].map(catchesUp)).toEqual([true, true]);
    expect(["markdown", "text", "code", "csv", "json", "svg", "mermaid", "file"].map(catchesUp)).toEqual(Array.from({ length: 8 }, () => false));
  });
});

describe("shouldCatchUp", () => {
  it("should ask when a saved canvas comes back with nothing unsaved", () => {
    expect(shouldCatchUp(ready)).toBe(true);
    expect(shouldCatchUp({ ...ready, kind: "ui" })).toBe(true);
  });

  it("should never ask while the editor holds unsaved changes, so a newer save cannot replace typing", () => {
    expect(shouldCatchUp({ ...ready, unsaved: true })).toBe(false);
  });

  it("should not ask for a document, a blank page, a hidden tab, or while a check runs", () => {
    expect(shouldCatchUp({ ...ready, kind: "markdown" })).toBe(false);
    expect(shouldCatchUp({ ...ready, stored: false })).toBe(false);
    expect(shouldCatchUp({ ...ready, visible: false })).toBe(false);
    expect(shouldCatchUp({ ...ready, running: true })).toBe(false);
  });

  it("should drop a second signal that follows a check within the gap, and ask again after it", () => {
    expect(shouldCatchUp({ ...ready, lastStartedAt: ready.now - CATCH_UP_GAP_MS + 1 })).toBe(false);
    expect(shouldCatchUp({ ...ready, lastStartedAt: ready.now - CATCH_UP_GAP_MS })).toBe(true);
  });

  it("should stop waiting for a check that never answered", () => {
    expect(shouldCatchUp({ ...ready, running: true, lastStartedAt: ready.now - CATCH_UP_STALE_MS + 1 })).toBe(false);
    expect(shouldCatchUp({ ...ready, running: true, lastStartedAt: ready.now - CATCH_UP_STALE_MS })).toBe(true);
  });
});

describe("takesAnswer", () => {
  const asked: EditorMoment = { artifactId: "a1", knownUpdatedAt: "2026-11-07T12:00:00.000Z", unsaved: false };

  it("should take an answer when the editor is where it was when it asked", () => {
    expect(takesAnswer(asked, { ...asked }, "a1")).toBe(true);
  });

  it("should drop an answer that arrives after the person typed", () => {
    expect(takesAnswer(asked, { ...asked, unsaved: true }, "a1")).toBe(false);
  });

  it("should drop an answer that arrives after the editor's own save moved it on", () => {
    expect(takesAnswer(asked, { ...asked, knownUpdatedAt: "2026-11-07T12:01:00.000Z" }, "a1")).toBe(false);
  });

  it("should drop an answer that arrives after another artifact opened, or that is about another artifact", () => {
    expect(takesAnswer(asked, { ...asked, artifactId: "a2" }, "a1")).toBe(false);
    expect(takesAnswer(asked, { ...asked }, "a2")).toBe(false);
    expect(takesAnswer(asked, { ...asked }, null)).toBe(false);
  });
});

describe("catchUpWords", () => {
  it("should name the agent's harness and the one frame it changed", () => {
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames(["Pricing"]) })).toBe('Claude Code changed the frame "Pricing". It is outlined below.');
  });

  it("should count the frames and name up to three of them", () => {
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames(["Home", "Pricing"]) })).toBe('Claude Code changed 2 frames: "Home" and "Pricing". They are outlined below.');
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames(["Home", "Pricing", "About"]) })).toBe('Claude Code changed 3 frames: "Home", "Pricing", and "About". They are outlined below.');
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames(["A", "B", "C", "D", "E"]) })).toBe('Claude Code changed 5 frames: "A", "B", "C", and 2 more. They are outlined below.');
  });

  it("should say what was removed, with or without a changed frame", () => {
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames(["Home"], 2) })).toBe('Claude Code changed the frame "Home", and removed 2 frames. It is outlined below.');
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames([], 1) })).toBe("Claude Code removed 1 frame.");
  });

  it("should say the canvas changed when no frame did (a new title, a theme)", () => {
    expect(catchUpWords({ kind: "canvas", changedBy: agent, frames: frames([]) })).toBe("Claude Code changed this canvas. This is the new version.");
  });

  it("should name a person by handle when they saved in the web app, and say Someone when nobody is known", () => {
    expect(catchUpWords({ kind: "ui", changedBy: { handle: "ann", harness: null }, frames: null })).toBe("@ann changed this interface. This is the new version.");
    expect(catchUpWords({ kind: "ui", changedBy: null, frames: null })).toBe("Someone changed this interface. This is the new version.");
  });
});
