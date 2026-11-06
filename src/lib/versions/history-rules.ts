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

/**
 * Whether a save merges into `latest` instead of adding a version: the same
 * editor saved it within the merge window, both are ordinary saves, and
 * `latest` is not protected (approved, or part of an approval request).
 */
export function shouldMergeInto(
  latest: MergeTarget | null,
  save: { editorId: string; saveKind: VersionSaveKind; now: Date },
  protectedIds: ReadonlySet<string>,
  windowMs: number = VERSION_MERGE_WINDOW_MS,
): boolean {
  if (latest?.createdBy !== save.editorId) return false;
  if (!mergingKinds.has(save.saveKind) || !mergeableKinds.has(latest.saveKind)) return false;
  if (protectedIds.has(latest.id)) return false;
  const age = save.now.getTime() - latest.savedAt.getTime();
  return age >= 0 && age <= windowMs;
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
