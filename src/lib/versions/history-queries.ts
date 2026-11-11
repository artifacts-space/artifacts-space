import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactVersion, sharingRequest, type ArtifactRecord, type ArtifactVersionRecord } from "@/db/schema";
import type { VersionDetailDto, VersionSummaryDto } from "@/lib/artifact-types";
import { lastEditorsFor } from "@/lib/artifacts";
import { filesReplacedSince, replacedFileNames } from "@/lib/files/copies";
import { harnessFor } from "@/lib/harness/harnesses";

import { versionRetention } from "./history-rules";

/**
 * Reading an artifact's history. Callers check that the viewer may edit the
 * artifact first (getEditableArtifact): readers who cannot edit never see it.
 */

const summaryColumns = {
  id: artifactVersion.id,
  createdAt: artifactVersion.createdAt,
  savedAt: artifactVersion.savedAt,
  saveKind: artifactVersion.saveKind,
  restoredFromId: artifactVersion.restoredFromId,
  bytes: artifactVersion.bytes,
  kind: artifactVersion.kind,
  title: artifactVersion.title,
  icon: artifactVersion.icon,
  theme: artifactVersion.theme,
  cover: artifactVersion.cover,
  createdBy: artifactVersion.createdBy,
  harness: artifactVersion.harness,
};

type SummaryRow = Pick<ArtifactVersionRecord, keyof typeof summaryColumns>;

async function pendingVersionId(artifactId: string) {
  const [row] = await getDb()
    .select({ versionId: sharingRequest.versionId })
    .from(sharingRequest)
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")))
    .limit(1);
  return row?.versionId ?? null;
}

interface SummaryContext {
  record: Pick<ArtifactRecord, "approvedVersionId">;
  pendingId: string | null;
  latestId: string | null;
  editors: Awaited<ReturnType<typeof lastEditorsFor>>;
  /** The file each replace version replaced, by version id. */
  replaced: ReadonlyMap<string, string>;
}

function toSummary(row: SummaryRow, context: SummaryContext): VersionSummaryDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    savedAt: row.savedAt.toISOString(),
    saveKind: row.saveKind,
    restoredFromId: row.restoredFromId,
    bytes: row.bytes,
    kind: row.kind,
    title: row.title,
    icon: row.icon,
    theme: row.theme,
    cover: row.cover,
    editor: row.createdBy ? context.editors.get(row.createdBy) ?? null : null,
    harness: row.harness ? harnessFor(row.harness).id : null,
    approved: row.id === context.record.approvedVersionId,
    pending: row.id === context.pendingId,
    latest: row.id === context.latestId,
    replacedFile: context.replaced.get(row.id) ?? null,
  };
}

async function latestId(artifactId: string) {
  const [row] = await getDb()
    .select({ id: artifactVersion.id })
    .from(artifactVersion)
    .where(eq(artifactVersion.artifactId, artifactId))
    .orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id))
    .limit(1);
  return row?.id ?? null;
}

/** The artifact's versions, newest first, without content. */
export async function listArtifactVersions(record: Pick<ArtifactRecord, "id" | "approvedVersionId">, limit: number = versionRetention.keep + 10): Promise<VersionSummaryDto[]> {
  const [rows, pendingId] = await Promise.all([
    getDb()
      .select(summaryColumns)
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, record.id))
      .orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id))
      .limit(Math.min(Math.max(limit, 1), versionRetention.keep + 10)),
    pendingVersionId(record.id),
  ]);
  const replaceIds = rows.flatMap((row) => (row.saveKind === "replace" ? [row.id] : []));
  const [editors, replaced] = await Promise.all([lastEditorsFor(rows.map((row) => ({ updatedBy: row.createdBy }))), replacedFileNames(replaceIds)]);
  const context = { record, pendingId, latestId: rows[0]?.id ?? null, editors, replaced };
  return rows.map((row) => toSummary(row, context));
}

/** One version of the artifact with its content, and the files replaced since it was saved, or null when it is not in the history. */
export async function getArtifactVersionDetail(record: Pick<ArtifactRecord, "id" | "approvedVersionId">, versionId: string): Promise<VersionDetailDto | null> {
  const [row] = await getDb()
    .select()
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, record.id), eq(artifactVersion.id, versionId)))
    .limit(1);
  if (!row) return null;
  const [pendingId, newest, editors, replaced, replacedSince] = await Promise.all([
    pendingVersionId(record.id),
    latestId(record.id),
    lastEditorsFor([{ updatedBy: row.createdBy }]),
    replacedFileNames(row.saveKind === "replace" ? [row.id] : []),
    filesReplacedSince(record.id, row.savedAt),
  ]);
  const summary = toSummary(row, { record, pendingId, latestId: newest, editors, replaced });
  const { summary: text, content, language, source, metadata } = row;
  return { ...summary, summary: text, content, language, source, metadata, replacedSince };
}
