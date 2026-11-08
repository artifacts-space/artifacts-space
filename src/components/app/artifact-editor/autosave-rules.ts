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
