import { validateArtifactContent } from "@/lib/artifact-content";
import { EDIT_SESSION_IDLE_MS, type EditSessionStep } from "@/lib/versions/history-rules";

import { draftKeys, type ArtifactDraft } from "./use-artifact-draft";

/**
 * Autosave decisions for the artifact editor, kept pure so they can be tested
 * without a browser: what changed, whether it can be saved, which editing
 * session a save belongs to, and how a refused save merges with someone
 * else's newer version.
 */

/** How long after the last keystroke the editor saves. */
export const AUTOSAVE_DELAY_MS = 1000;

/** The longest a change waits while typing goes on without a pause: it is saved at least this often. */
export const AUTOSAVE_MAX_WAIT_MS = 5000;

/**
 * The shortest time between two autosaves, so an editor sends at most 720
 * an hour however it types: well under the runaway cap on autosaves
 * (`artifactAutosave` in src/lib/abuse/limits.ts). Leaving the field, the
 * tab, or the artifact saves at once.
 */
export const AUTOSAVE_MIN_INTERVAL_MS = 5000;

/** When the next autosave may go, as of a change made `now`. Times are ms since the epoch. */
export interface SaveTiming {
  now: number;
  /** When the oldest unsaved change was made. */
  pendingSince: number;
  /** When the last autosave was sent; null before the first. */
  lastSaveAt: number | null;
  /**
   * The draft is sent again after someone else's newer save was merged into
   * it, or after "Keep my changes". That is not typing, and each one needs
   * someone else's save first, so it waits only the usual second.
   */
  resend?: boolean;
}

/**
 * How long to wait, after a change made now, before saving: a second after
 * typing stops, but no later than AUTOSAVE_MAX_WAIT_MS after the oldest
 * unsaved change, and never sooner than AUTOSAVE_MIN_INTERVAL_MS after the
 * last save. A resend waits only the second.
 */
export function nextSaveDelay({ now, pendingSince, lastSaveAt, resend = false }: SaveTiming): number {
  if (resend) return AUTOSAVE_DELAY_MS;
  const due = Math.min(now + AUTOSAVE_DELAY_MS, pendingSince + AUTOSAVE_MAX_WAIT_MS);
  const allowed = lastSaveAt === null ? due : Math.max(due, lastSaveAt + AUTOSAVE_MIN_INTERVAL_MS);
  return Math.max(0, allowed - now);
}

/** The editor's editing session: open after its first save, until a long pause, leaving, or someone else's save closes it. */
export interface EditSession {
  open: boolean;
  /** When this session last saved (ms since the epoch); null before its first save. */
  lastSavedAt: number | null;
}

/** No session yet: the next save starts one. */
export const closedSession: EditSession = { open: false, lastSavedAt: null };

/** The fields of `draft` that differ from `base`. Only these are sent, so a save never rewrites fields it did not touch. */
export function changedFields(base: ArtifactDraft, draft: ArtifactDraft): Partial<ArtifactDraft> {
  const changes: Partial<ArtifactDraft> = {};
  for (const key of draftKeys) {
    if (draft[key] !== base[key]) Object.assign(changes, { [key]: draft[key] });
  }
  return changes;
}

/** True when `draft` differs from `base` in any field. */
export function hasChanges(base: ArtifactDraft, draft: ArtifactDraft): boolean {
  return draftKeys.some((key) => draft[key] !== base[key]);
}

/**
 * Why the draft cannot be saved yet, or null when it can. Content is checked
 * against its format the same way agents' content is (validateArtifactContent),
 * so autosave never stores an invalid ui spec, JSON, CSV, SVG, or diagram.
 */
export function draftProblem(draft: ArtifactDraft): string | null {
  if (!draft.title.trim()) return "Add a title to save.";
  if (draft.kind !== "file" && !draft.content.trim()) return "Add some content to save.";
  const check = validateArtifactContent(draft.kind, draft.content);
  const firstError = check.issues.find((issue) => issue.severity === "error");
  return firstError ? `Not saved yet: ${firstError.message}` : null;
}

/**
 * Whether the next save starts a new editing session (and so a new version)
 * or continues the open one: it starts one after the first save, after a
 * pause longer than EDIT_SESSION_IDLE_MS, and after the session was closed.
 */
export function sessionStep(session: EditSession, now: number): EditSessionStep {
  if (!session.open || session.lastSavedAt === null) return "start";
  return now - session.lastSavedAt > EDIT_SESSION_IDLE_MS ? "start" : "continue";
}

/** A merge of the editor's draft with someone else's newer save. */
export type MergeOutcome = { kind: "merged"; draft: ArtifactDraft } | { kind: "conflict"; fields: (keyof ArtifactDraft)[] };

/**
 * Merges the editor's draft (`mine`) with a newer saved version (`theirs`),
 * both changed from `base`, field by field. It merges only when the two
 * changed different fields, or made the same change; otherwise it reports
 * the fields both changed and nothing is merged.
 */
export function mergeDrafts(base: ArtifactDraft, mine: ArtifactDraft, theirs: ArtifactDraft): MergeOutcome {
  const fields = draftKeys.filter((key) => mine[key] !== base[key] && theirs[key] !== base[key] && mine[key] !== theirs[key]);
  if (fields.length > 0) return { kind: "conflict", fields };
  const draft = { ...theirs };
  for (const key of draftKeys) {
    if (mine[key] !== base[key]) Object.assign(draft, { [key]: mine[key] });
  }
  return { kind: "merged", draft };
}

/**
 * "Keep my changes" after a conflict: their newer version, with every field
 * the editor changed from `base` taken from the editor's draft. Fields only
 * they changed keep their change.
 */
export function keepMineOver(base: ArtifactDraft, mine: ArtifactDraft, theirs: ArtifactDraft): ArtifactDraft {
  const draft = { ...theirs };
  for (const key of draftKeys) {
    if (mine[key] !== base[key]) Object.assign(draft, { [key]: mine[key] });
  }
  return draft;
}
