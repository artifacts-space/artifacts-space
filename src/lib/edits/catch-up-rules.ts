import type { FrameChanges } from "@/lib/canvas/frame-changes";

import type { ChangedBy } from "./edit-conflict-rules";

/*
 * Catching up: an open canvas or interface shows a newer save (an agent's,
 * or the person's own from another tab) when its tab comes back, without a
 * reload. The editor asks the server whether the artifact moved on, on
 * focus and when the tab becomes visible, never on a timer. These are the
 * decisions; the hook is src/components/app/artifact-editor/use-catch-up.ts.
 */

/** Focus and visibility often arrive together: a second signal this soon after a check is dropped. */
export const CATCH_UP_GAP_MS = 5000;

/**
 * The formats that catch up: rendered views, which redraw cleanly. A
 * document holds a caret in text that would move under it, so documents
 * keep to a reload for now.
 */
export function catchesUp(kind: string): boolean {
  return kind === "canvas" || kind === "ui";
}

export interface CatchUpCheck {
  kind: string;
  /** The artifact is saved: a blank page that was never saved has nothing newer. */
  stored: boolean;
  /** The tab is visible. */
  visible: boolean;
  /** The editor holds changes that are not saved, or a save is on its way. */
  unsaved: boolean;
  /** A check is running. */
  running: boolean;
  /** When the last check started (ms since the epoch), or null. */
  lastStartedAt: number | null;
  now: number;
}

/**
 * Whether a return to the tab starts a check. Never with unsaved changes:
 * a newer save must not replace what the person has typed, and their own
 * save settles it (it goes through over an agent's, or offers the other
 * person's version).
 */
export function shouldCatchUp(check: CatchUpCheck): boolean {
  if (!catchesUp(check.kind) || !check.stored || !check.visible) return false;
  if (check.unsaved || check.running) return false;
  return check.lastStartedAt === null || check.now - check.lastStartedAt >= CATCH_UP_GAP_MS;
}

/** Who saved, as the notice names them: the agent's harness, the person's handle, or "Someone". */
function whoSaved(changedBy: ChangedBy | null): string {
  if (changedBy?.harness) return changedBy.harness.name;
  return changedBy?.handle ? `@${changedBy.handle}` : "Someone";
}

/** How many frame names the notice spells out before it counts the rest. */
const NAMED_FRAMES = 3;

function frameCount(count: number): string {
  return count === 1 ? "1 frame" : `${String(count)} frames`;
}

/** "A, B, and C", with the rest counted: frame names are the canvas's own words, shown as plain text. */
function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAMED_FRAMES).map((name) => `"${name}"`);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")}, and ${String(rest)} more`;
  if (shown.length <= 2) return shown.join(" and ");
  return `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1] ?? ""}`;
}

/** What changed on a canvas, in words, and where to look. */
function canvasWords(who: string, frames: FrameChanges): string {
  const removed = frames.removed > 0 ? `removed ${frameCount(frames.removed)}` : "";
  const names = frames.changed.map((frame) => frame.name);
  if (names.length === 0) return removed ? `${who} ${removed}.` : `${who} changed this canvas. This is the new version.`;
  const changed = names.length === 1 ? `changed the frame ${nameList(names)}` : `changed ${frameCount(names.length)}: ${nameList(names)}`;
  const look = names.length === 1 ? "It is outlined below." : "They are outlined below.";
  return `${who} ${changed}${removed ? `, and ${removed}` : ""}. ${look}`;
}

/**
 * The notice a person reads after their open artifact took a newer save:
 * who saved, what changed, and where to look. `frames` is for a canvas.
 */
export function catchUpWords(input: { kind: string; changedBy: ChangedBy | null; frames: FrameChanges | null }): string {
  const who = whoSaved(input.changedBy);
  if (input.kind === "canvas" && input.frames) return canvasWords(who, input.frames);
  return `${who} changed this ${input.kind === "ui" ? "interface" : "artifact"}. This is the new version.`;
}
