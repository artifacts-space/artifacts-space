import { saveStatusLabel } from "@/components/app/artifact-editor/save-status";
import type { AutosaveStatus } from "@/components/app/artifact-editor/use-autosave";

/** How the header's save indicator looks: nothing yet, a change on its way, saved, or a problem to read. */
export type SaveTone = "idle" | "saving" | "saved" | "problem";

/** What the save indicator beside the page header's More menu shows. */
export interface SaveIndicatorState {
  tone: SaveTone;
  /** "Saving…", "Saved", or why the latest change is not saved; null when there is nothing to say. */
  label: string | null;
  /** Set when sending the save again may help, such as after a dropped connection. */
  onRetry: (() => void) | null;
}

/** Nothing to say: the editor has not changed anything yet. */
export const idleSave: SaveIndicatorState = { tone: "idle", label: null, onRetry: null };

/** The tone for an autosave status. A held, failed, or conflicting save is a problem; unsaved typing counts as saving. */
export function saveTone(status: AutosaveStatus, dirty: boolean): SaveTone {
  if (status.kind === "held" || status.kind === "failed" || status.kind === "conflict") return "problem";
  if (status.kind === "saving" || dirty) return "saving";
  if (status.kind === "saved") return "saved";
  return "idle";
}

/**
 * The save indicator for the in-place editor's autosave status, with the
 * same words as the /app editor (saveStatusLabel). Only a failed save offers
 * to try again; a held one waits for the editor to fix what it names.
 */
export function saveIndicatorFor(status: AutosaveStatus, dirty: boolean, retry: () => void): SaveIndicatorState {
  return {
    tone: saveTone(status, dirty),
    label: saveStatusLabel(status, dirty),
    onRetry: status.kind === "failed" ? retry : null,
  };
}

/** A problem that stops editing before it starts, such as the editable copy failing to load. */
export function saveProblem(message: string): SaveIndicatorState {
  return { tone: "problem", label: message, onRetry: null };
}
