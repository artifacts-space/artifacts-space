import type { VersionSaveKind } from "@/lib/artifact-types";

/**
 * Version history rules. Every save of any artifact files a version. Quick
 * follow-up saves by the same editor merge into the latest version instead,
 * and old versions are pruned. Versions that readers rely on (the approved
 * version of a link or public artifact, and a version waiting for approval)
 * are never merged into or pruned.
 */

/** Saves by the same editor this soon after the latest version merge into it. */
export const VERSION_MERGE_WINDOW_MS = 2 * 60 * 1000;

/**
 * An editing session in the web editor files one version. It stays open while
 * saves keep coming at most this far apart; after a longer pause the next save
 * starts a new version.
 */
export const EDIT_SESSION_IDLE_MS = 5 * 60 * 1000;

/**
 * Where an autosave sits in its editing session. "start": the first save after
 * the editor opened, after a pause, or after someone else saved; it always
 * files a new version. "continue": a later save of the same session; it merges
 * into the version the session filed.
 */
export const editSessionSteps = ["start", "continue"] as const;
export type EditSessionStep = (typeof editSessionSteps)[number];

/** How many versions an artifact keeps, and for how long. */
export const versionRetention = { keep: 100, maxAgeMs: 365 * 24 * 60 * 60 * 1000 } as const;

export interface VersionRetention {
  keep: number;
  maxAgeMs: number;
}

/** The latest version, as the merge rule sees it. */
export interface MergeTarget {
  id: string;
  createdBy: string | null;
  savedAt: Date;
  saveKind: VersionSaveKind;
}

/** Save kinds that may merge into the latest version. Restores and snapshots always stand alone. */
const mergingKinds: ReadonlySet<VersionSaveKind> = new Set(["edit", "files"]);
/** Versions a later save may merge into. A restore stays visible as its own entry. */
const mergeableKinds: ReadonlySet<VersionSaveKind> = new Set(["create", "edit", "files"]);

/** One save, as the merge rule sees it. `session` is set for web editor autosaves only. */
export interface MergeCandidate {
  editorId: string;
  saveKind: VersionSaveKind;
  now: Date;
  session?: EditSessionStep | undefined;
}

/** How long after `latest` a save may still merge into it. */
function mergeWindow(session: EditSessionStep | undefined, windowMs: number): number {
  return session === "continue" ? EDIT_SESSION_IDLE_MS : windowMs;
}

/**
 * Whether a save merges into `latest` instead of adding a version: the same
 * editor saved it within the merge window, both are ordinary saves, and
 * `latest` is not protected (approved, or part of an approval request).
 * An autosave that starts an editing session never merges. One that continues
 * a session merges while the pause since the last save is under
 * EDIT_SESSION_IDLE_MS. A save by anyone else in between makes `latest`
 * theirs, so the session's next save files a new version. Protected
 * versions are never merged into, even by a session: see canDropSuperseded.
 */
export function shouldMergeInto(
  latest: MergeTarget | null,
  save: MergeCandidate,
  protectedIds: ReadonlySet<string>,
  windowMs: number = VERSION_MERGE_WINDOW_MS,
): boolean {
  if (save.session === "start") return false;
  if (latest?.createdBy !== save.editorId) return false;
  if (!mergingKinds.has(save.saveKind) || !mergeableKinds.has(latest.saveKind)) return false;
  if (protectedIds.has(latest.id)) return false;
  const age = save.now.getTime() - latest.savedAt.getTime();
  return age >= 0 && age <= mergeWindow(save.session, windowMs);
}

/** A request that names a version, as the superseded-version rule sees it. */
export interface VersionReference {
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
}

/**
 * Whether a continuing editing session may delete `previous`, its own
 * version from moments ago, now that a newer version holds the session's
 * work. It applies when the save could not merge into `previous` only
 * because `previous` was protected at the time (approved, or waiting for
 * approval) and the approval step has since moved on to the new version:
 * `previous` is no longer the approved version, and no request names it
 * except the editor's own instant approvals. A version anyone else decided
 * on, or that still waits, is never touched, and a version is never edited
 * in place after a request named it. Together with merging, a session files
 * one version even on link and public artifacts.
 */
export function canDropSuperseded(
  previous: MergeTarget | null,
  save: MergeCandidate,
  state: { newVersionId: string; approvedVersionId: string | null; references: readonly VersionReference[] },
): boolean {
  if (!previous || previous.id === state.newVersionId || previous.id === state.approvedVersionId) return false;
  if (save.session !== "continue" || !shouldMergeInto(previous, save, new Set())) return false;
  return state.references.every((reference) => reference.status === "approved" && reference.requestedBy === save.editorId && reference.decidedBy === save.editorId);
}

/** A version as pruning sees it. */
export interface RetainedVersion {
  id: string;
  savedAt: Date;
}

/**
 * The versions to delete, given every version of one artifact newest first.
 * A version goes when it is past the newest `keep`, or older than `maxAgeMs`.
 * The newest version (the current content) and protected versions always stay.
 */
export function selectPrunableVersions(
  newestFirst: readonly RetainedVersion[],
  protectedIds: ReadonlySet<string>,
  now: Date,
  policy: VersionRetention = versionRetention,
): string[] {
  const cutoff = now.getTime() - policy.maxAgeMs;
  const prunable: string[] = [];
  newestFirst.forEach((version, index) => {
    if (index === 0 || protectedIds.has(version.id)) return;
    if (index >= policy.keep || version.savedAt.getTime() < cutoff) prunable.push(version.id);
  });
  return prunable;
}

/** Bytes a version stores: its content and metadata. Counts toward the author's storage quota. */
export function versionBytes(fields: { content: string; metadata: Record<string, unknown> }): number {
  const encoder = new TextEncoder();
  return encoder.encode(fields.content).length + encoder.encode(JSON.stringify(fields.metadata)).length;
}
