import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, type ArtifactRecord, type ArtifactVersionRecord } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { VersionSaveKind } from "@/lib/artifact-types";
import { pruneFileCopiesQuietly } from "@/lib/files/copies";
import { pruneUnusedContentFilesQuietly, pruneUnusedIconFilesQuietly } from "@/lib/files/icon-cleanup";
import { dropsShownImage } from "@/lib/files/icon-cleanup-rules";
import { restampTo, stampColumns, stampOf, type HarnessStamp } from "@/lib/harness/harness-rules";

import { canDropSuperseded, selectPrunableVersions, shouldMergeInto, versionBytes, versionRetention, type EditSessionStep } from "./history-rules";
import { sameReviewedFields } from "./rules";

/**
 * Version rows: filing a save (new or merged), starting the history of an
 * artifact saved before history existed, and pruning. The approval rule
 * that decides what readers outside the team see lives in service.ts.
 */

/** The fields a version copies from the artifact. */
function copiedFields(record: ArtifactRecord) {
  const { title, icon, theme, cover, summary, content, kind, language, project, source, metadata } = record;
  return { title, icon, theme, cover, summary, content, kind, language, project, source, metadata, bytes: versionBytes(record) };
}

/** Inserts a version of `record` and returns its id. `at` back-dates it, for a snapshot of an older save. */
export async function insertVersion(
  record: ArtifactRecord,
  options: { createdBy: string | null; saveKind: VersionSaveKind; restoredFromId?: string | null; at?: Date; harness?: HarnessStamp | null | undefined },
): Promise<string> {
  const id = randomUUID();
  const at = options.at ? { createdAt: options.at, savedAt: options.at } : {};
  await getDb()
    .insert(artifactVersion)
    .values({ id, artifactId: record.id, ...copiedFields(record), ...stampColumns(options.harness), createdBy: options.createdBy, saveKind: options.saveKind, restoredFromId: options.restoredFromId ?? null, ...at });
  return id;
}

/** The newest version of an artifact, or null. */
export async function latestVersion(artifactId: string): Promise<ArtifactVersionRecord | null> {
  const [row] = await getDb()
    .select()
    .from(artifactVersion)
    .where(eq(artifactVersion.artifactId, artifactId))
    .orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id))
    .limit(1);
  return row ?? null;
}

/**
 * Versions readers or reviewers rely on. `pinned`: the approved version and
 * versions waiting for approval, which are never pruned. `referenced`: also
 * versions any request ever named, which are never merged into, so an
 * approval or denial always shows what was decided.
 */
export async function protectedVersions(artifactId: string, approvedVersionId: string | null) {
  const rows = await getDb()
    .select({ versionId: sharingRequest.versionId, status: sharingRequest.status })
    .from(sharingRequest)
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit")));
  const pinned = new Set<string>(approvedVersionId ? [approvedVersionId] : []);
  const referenced = new Set(pinned);
  for (const row of rows) {
    if (!row.versionId) continue;
    referenced.add(row.versionId);
    if (row.status === "pending") pinned.add(row.versionId);
  }
  return { pinned, referenced };
}

/**
 * Makes sure an artifact saved before history began has a first version:
 * what it showed before this save, credited to whoever saved it last.
 */
export async function ensureHistoryStart(before: ArtifactRecord): Promise<void> {
  if (await latestVersion(before.id)) return;
  await insertVersion(before, { createdBy: before.updatedBy ?? before.userId, saveKind: "snapshot", at: before.updatedAt, harness: stampOf(before.harness) });
}

/** The latest version when it shows exactly what `record` shows; otherwise a new snapshot of it. */
export async function versionMatching(record: ArtifactRecord, createdBy: string | null): Promise<string> {
  const latest = await latestVersion(record.id);
  if (latest && sameReviewedFields(latest, record)) return latest.id;
  return insertVersion(record, { createdBy, saveKind: "snapshot", harness: stampOf(record.harness) });
}

/**
 * An agent save that changes nothing still says which agent saved last, so
 * the latest version records it too and History agrees with the byline. Only
 * an agent's version is relabelled, never one saved in the web app.
 */
async function restampVersion(latest: ArtifactVersionRecord, record: ArtifactRecord, save: { editorId: string; harness?: HarnessStamp | null | undefined }) {
  // A version saved in the web app stays the person's: an agent never relabels it (saveSourceKey).
  if (!save.harness || latest.createdBy !== save.editorId || latest.harness === null) return;
  // Versions an approval or a decision names (the approved one too) keep what was decided.
  const { referenced } = await protectedVersions(record.id, record.approvedVersionId);
  const next = restampTo({ harness: latest.harness, locked: referenced.has(latest.id) }, save.harness);
  if (!next) return;
  await getDb().update(artifactVersion).set({ harness: next }).where(eq(artifactVersion.id, latest.id));
}

/** Folds a save into a version from the same source (saveSourceKey), so the harness it records stays right. */
async function mergeInto(versionId: string, record: ArtifactRecord, harness: HarnessStamp | null | undefined) {
  await getDb()
    .update(artifactVersion)
    .set({ ...copiedFields(record), ...stampColumns(harness), savedAt: sql`now()` })
    .where(eq(artifactVersion.id, versionId));
}

/**
 * Files a save of `record` as a version and returns its id. A save that
 * changes nothing the latest version shows returns that version. A quick
 * follow-up save from the same source (the same person through the same
 * agent harness, or the web app) merges into the latest version, unless
 * that version is protected (see protectedVersions) or the save drops an
 * uploaded icon or cover image the latest version shows. A web editor
 * autosave passes its editing-session step: see shouldMergeInto.
 */
export async function fileVersion(
  record: ArtifactRecord,
  save: { editorId: string; saveKind: VersionSaveKind; restoredFromId?: string | null; session?: EditSessionStep | undefined; harness?: HarnessStamp | null | undefined },
): Promise<string> {
  const latest = await latestVersion(record.id);
  if (latest && save.saveKind === "edit" && sameReviewedFields(latest, record)) {
    await restampVersion(latest, record, save);
    return latest.id;
  }
  const { referenced } = await protectedVersions(record.id, record.approvedVersionId);
  // A save that drops an uploaded icon or cover image files its own version, so the image stays restorable.
  if (latest && shouldMergeInto(latest, { ...save, now: new Date() }, referenced) && !dropsShownImage(latest, record)) {
    await mergeInto(latest.id, record, save.harness);
    return latest.id;
  }
  return insertVersion(record, { createdBy: save.editorId, saveKind: save.saveKind, restoredFromId: save.restoredFromId ?? null, harness: save.harness });
}

/**
 * After a continuing editing session filed a new version because its own
 * previous one was protected at the time, deletes that previous version when
 * canDropSuperseded allows it, with the editor's own instant-approval rows
 * that named it (the new version has its own). Call it after the approval
 * step. Quietly does nothing when the rule says no.
 */
export async function dropSupersededSessionVersion(
  record: ArtifactRecord,
  previous: ArtifactVersionRecord | null,
  save: { editorId: string; saveKind: VersionSaveKind; session?: EditSessionStep | undefined; harness?: HarnessStamp | null | undefined; newVersionId: string },
): Promise<void> {
  if (!previous || previous.id === save.newVersionId || save.session !== "continue" || dropsShownImage(previous, record)) return;
  const [[owner], references] = await Promise.all([
    getDb().select({ approvedVersionId: artifact.approvedVersionId }).from(artifact).where(eq(artifact.id, record.id)).limit(1),
    getDb()
      .select({ status: sharingRequest.status, requestedBy: sharingRequest.requestedBy, decidedBy: sharingRequest.decidedBy })
      .from(sharingRequest)
      .where(and(eq(sharingRequest.artifactId, record.id), eq(sharingRequest.versionId, previous.id))),
  ]);
  const state = { newVersionId: save.newVersionId, approvedVersionId: owner?.approvedVersionId ?? null, references };
  if (!owner || !canDropSuperseded(previous, { ...save, now: new Date() }, state)) return;
  await getDb().delete(sharingRequest).where(and(eq(sharingRequest.artifactId, record.id), eq(sharingRequest.versionId, previous.id), eq(sharingRequest.status, "approved")));
  await getDb().delete(artifactVersion).where(and(eq(artifactVersion.artifactId, record.id), eq(artifactVersion.id, previous.id)));
}

/** The icon and cover values of dropped versions, for the image cleanup. */
function droppedImages(rows: readonly { icon: string | null; cover: string | null }[]): string[] {
  return rows.flatMap((row) => [row.icon, row.cover]).filter((value): value is string => value?.startsWith(FILE_PREFIX) === true);
}

/**
 * Deletes the versions of one artifact that retention lets go, then the icon
 * and cover images, the removed media, and the old copies of replaced files
 * only those versions showed.
 * Returns how many versions went.
 */
export async function pruneArtifactVersions(artifactId: string, now: Date = new Date()): Promise<number> {
  const [owner] = await getDb().select({ approvedVersionId: artifact.approvedVersionId }).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!owner) return 0;
  const [versions, { pinned }] = await Promise.all([
    getDb()
      .select({ id: artifactVersion.id, savedAt: artifactVersion.savedAt, icon: artifactVersion.icon, cover: artifactVersion.cover })
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, artifactId))
      .orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id)),
    protectedVersions(artifactId, owner.approvedVersionId),
  ]);
  const prunable = selectPrunableVersions(versions, pinned, now);
  if (prunable.length === 0) return 0;
  await getDb().delete(artifactVersion).where(and(eq(artifactVersion.artifactId, artifactId), inArray(artifactVersion.id, prunable)));
  const dropped = new Set(prunable);
  const images = droppedImages(versions.filter((version) => dropped.has(version.id)));
  if (images.length > 0) await pruneUnusedIconFilesQuietly(artifactId, images);
  await pruneUnusedContentFilesQuietly(artifactId);
  await pruneFileCopiesQuietly(artifactId);
  return prunable.length;
}

/** The most versions one cleanup run deletes. The next run continues. */
export const versionCleanupBatchSize = 1000;

/** Removes the icon and cover images, the removed media, and the old file copies that only the dropped versions showed, one artifact at a time. */
async function pruneDroppedFiles(rows: readonly { artifact_id: string; icon: string | null; cover: string | null }[]): Promise<void> {
  const byArtifact = new Map<string, { icon: string | null; cover: string | null }[]>();
  for (const row of rows) byArtifact.set(row.artifact_id, [...(byArtifact.get(row.artifact_id) ?? []), row]);
  for (const [artifactId, dropped] of byArtifact) {
    const images = droppedImages(dropped);
    if (images.length > 0) await pruneUnusedIconFilesQuietly(artifactId, images);
    await pruneUnusedContentFilesQuietly(artifactId);
    await pruneFileCopiesQuietly(artifactId);
  }
}

/**
 * The cleanup job's pass over every artifact, with the same rule as
 * selectPrunableVersions: past the newest 100, or older than a year, but
 * never the newest version, the approved version, or one waiting for approval.
 * Icon and cover images, and removed media, only the dropped versions
 * showed go with them.
 */
export async function pruneAllVersions(): Promise<{ removed: number; remaining: boolean }> {
  const maxAgeDays = Math.round(versionRetention.maxAgeMs / 86_400_000);
  const result = await getDb().execute<{ id: string; artifact_id: string; icon: string | null; cover: string | null }>(sql`
    delete from ${artifactVersion} where id in (
      select ranked.id from (
        select v.id, v.artifact_id, v.saved_at,
          row_number() over (partition by v.artifact_id order by v.created_at desc, v.id desc) as rank
        from ${artifactVersion} v
      ) ranked
      join ${artifact} a on a.id = ranked.artifact_id
      where ranked.rank > 1
        and (ranked.rank > ${versionRetention.keep} or ranked.saved_at < now() - make_interval(days => ${maxAgeDays}))
        and ranked.id is distinct from a.approved_version_id
        and not exists (select 1 from ${sharingRequest} s where s.version_id = ranked.id and s.status = 'pending')
      limit ${versionCleanupBatchSize}
    )
    returning id, artifact_id, icon, cover
  `);
  await pruneDroppedFiles(result.rows);
  const removed = result.rows.length;
  return { removed, remaining: removed === versionCleanupBatchSize };
}

/** One version of one artifact, or null when it is not that artifact's. */
export async function getVersionOf(artifactId: string, versionId: string): Promise<ArtifactVersionRecord | null> {
  const [row] = await getDb()
    .select()
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, artifactId), eq(artifactVersion.id, versionId)))
    .limit(1);
  return row ?? null;
}
