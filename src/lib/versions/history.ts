import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, type ArtifactRecord, type ArtifactVersionRecord } from "@/db/schema";
import type { VersionSaveKind } from "@/lib/artifact-types";

import { selectPrunableVersions, shouldMergeInto, versionBytes, versionRetention } from "./history-rules";
import { sameReviewedFields } from "./rules";

/**
 * Version rows: filing a save (new or merged), starting the history of an
 * artifact saved before history existed, and pruning. The approval rule
 * that decides what readers outside the team see lives in service.ts.
 */

/** The fields a version copies from the artifact. */
function copiedFields(record: ArtifactRecord) {
  const { title, icon, summary, content, kind, language, project, source, metadata } = record;
  return { title, icon, summary, content, kind, language, project, source, metadata, bytes: versionBytes(record) };
}

/** Inserts a version of `record` and returns its id. `at` back-dates it, for a snapshot of an older save. */
export async function insertVersion(
  record: ArtifactRecord,
  options: { createdBy: string | null; saveKind: VersionSaveKind; restoredFromId?: string | null; at?: Date },
): Promise<string> {
  const id = randomUUID();
  const at = options.at ? { createdAt: options.at, savedAt: options.at } : {};
  await getDb()
    .insert(artifactVersion)
    .values({ id, artifactId: record.id, ...copiedFields(record), createdBy: options.createdBy, saveKind: options.saveKind, restoredFromId: options.restoredFromId ?? null, ...at });
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
  await insertVersion(before, { createdBy: before.updatedBy ?? before.userId, saveKind: "snapshot", at: before.updatedAt });
}

/** The latest version when it shows exactly what `record` shows; otherwise a new snapshot of it. */
export async function versionMatching(record: ArtifactRecord, createdBy: string | null): Promise<string> {
  const latest = await latestVersion(record.id);
  if (latest && sameReviewedFields(latest, record)) return latest.id;
  return insertVersion(record, { createdBy, saveKind: "snapshot" });
}

async function mergeInto(versionId: string, record: ArtifactRecord) {
  await getDb()
    .update(artifactVersion)
    .set({ ...copiedFields(record), savedAt: sql`now()` })
    .where(eq(artifactVersion.id, versionId));
}

/**
 * Files a save of `record` as a version and returns its id. A save that
 * changes nothing the latest version shows returns that version. A quick
 * follow-up save by the same editor merges into the latest version, unless
 * that version is protected (see protectedVersions).
 */
export async function fileVersion(
  record: ArtifactRecord,
  save: { editorId: string; saveKind: VersionSaveKind; restoredFromId?: string | null },
): Promise<string> {
  const latest = await latestVersion(record.id);
  if (latest && save.saveKind === "edit" && sameReviewedFields(latest, record)) return latest.id;
  const { referenced } = await protectedVersions(record.id, record.approvedVersionId);
  if (latest && shouldMergeInto(latest, { ...save, now: new Date() }, referenced)) {
    await mergeInto(latest.id, record);
    return latest.id;
  }
  return insertVersion(record, { createdBy: save.editorId, saveKind: save.saveKind, restoredFromId: save.restoredFromId ?? null });
}

/** Deletes the versions of one artifact that retention lets go. Returns how many went. */
export async function pruneArtifactVersions(artifactId: string, now: Date = new Date()): Promise<number> {
  const [owner] = await getDb().select({ approvedVersionId: artifact.approvedVersionId }).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!owner) return 0;
  const [versions, { pinned }] = await Promise.all([
    getDb()
      .select({ id: artifactVersion.id, savedAt: artifactVersion.savedAt })
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, artifactId))
      .orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id)),
    protectedVersions(artifactId, owner.approvedVersionId),
  ]);
  const prunable = selectPrunableVersions(versions, pinned, now);
  if (prunable.length === 0) return 0;
  await getDb().delete(artifactVersion).where(and(eq(artifactVersion.artifactId, artifactId), inArray(artifactVersion.id, prunable)));
  return prunable.length;
}

/** The most versions one cleanup run deletes. The next run continues. */
export const versionCleanupBatchSize = 1000;

/**
 * The cleanup job's pass over every artifact, with the same rule as
 * selectPrunableVersions: past the newest 100, or older than a year, but
 * never the newest version, the approved version, or one waiting for approval.
 */
export async function pruneAllVersions(): Promise<{ removed: number; remaining: boolean }> {
  const maxAgeDays = Math.round(versionRetention.maxAgeMs / 86_400_000);
  const result = await getDb().execute<{ id: string }>(sql`
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
    returning id
  `);
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
