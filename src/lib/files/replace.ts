import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifactFileCopy } from "@/db/file-copy-schema";
import { artifact, artifactFile, artifactVersion, sharingRequest, type ArtifactFileRecord, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifactMeta } from "@/lib/access";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import { notifySharingRequest } from "@/lib/notifications/create";
import { capabilityHolderTeamQuery } from "@/lib/teams/capability-sql";
import type { SharingActor } from "@/lib/sharing/rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { forgetArtifactCache } from "@/lib/versions/cache";
import { pruneArtifactVersions } from "@/lib/versions/history";
import { planVersionedChangeApproval, prepareVersionedChange, type EditStatus, type VersionedChangeApproval } from "@/lib/versions/service";

import { canUseFileInArtifact } from "./access-rules";
import { replacementFilename, replaceTargetProblem } from "./replace-rules";
import { getFileRow, toFileDto } from "./store";
import type { FileDto } from "./types";

/**
 * Replacing a file: the editor's finished upload becomes the current file
 * of an entry already in the artifact. The entry keeps its id, its place,
 * and its name, so links and embeds open the new file; what it held before
 * becomes an old copy (artifact_file_copy) that History offers to people who
 * can edit. The swap is one statement, so a failed or refused replace leaves
 * the current file, its copies, and the upload exactly as they were
 * (replaceFile says what earlier steps may still record). The upload was checked and counted
 * like any other (files_request_upload, files_finalize).
 */

const uploadProblem =
  "The new file is unknown, still uploading, or not yours to use. Upload it (files_request_upload, PUT, files_finalize) and use the id you get back.";

/** No harness: a change in the web app. */
const noStamp = () => Promise.resolve(null);

/** SQL: whether a version of `artifactId` shows the file `ref` (file:<id>) as its icon or cover. The pre-check and the swap use the same rule. */
function versionShows(artifactId: string, ref: string) {
  return sql`exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and (v.icon = ${ref} or v.cover = ${ref} or v.cover like ${`${ref}@%`}))`;
}

/** Whether any version, or the artifact now, shows this file as its icon or cover. Such images are changed through their pickers. */
async function shownAsIconOrCover(artifactId: string, fileId: string): Promise<boolean> {
  const ref = `${FILE_PREFIX}${fileId}`;
  const result = await getDb().execute<{ shown: boolean }>(sql`
    select exists (select 1 from ${artifact} a where a.id = ${artifactId} and (a.icon = ${ref} or a.cover = ${ref} or a.cover like ${`${ref}@%`}))
      or ${versionShows(artifactId, ref)} as shown
  `);
  return result.rows[0]?.shown === true;
}

/** The entry to replace, once the editor may edit its artifact; "not found" otherwise, so a private file's existence never leaks. */
async function editableTarget(editorId: string, fileId: string, inArtifact: string | undefined): Promise<ArtifactFileRecord & { artifactId: string }> {
  const row = z.uuid().safeParse(fileId).success ? await getFileRow(fileId.toLowerCase()) : null;
  const artifactId = row?.artifactId ?? null;
  if (!row || artifactId === null || (inArtifact !== undefined && artifactId !== inArtifact)) throw new UserFacingError("File not found.");
  if (!(await getEditableArtifactMeta(editorId, artifactId))) throw new UserFacingError("File not found.");
  const problem = replaceTargetProblem(row, { shownAsImage: await shownAsIconOrCover(artifactId, row.id) });
  if (problem) throw new UserFacingError(problem);
  return { ...row, artifactId };
}

async function usableUpload(editorId: string, uploadId: string): Promise<ArtifactFileRecord> {
  const row = z.uuid().safeParse(uploadId).success ? await getFileRow(uploadId.toLowerCase()) : null;
  if (row?.artifactId !== null || !canUseFileInArtifact(row, editorId, null)) throw new UserFacingError(uploadProblem);
  return row;
}

interface Swap {
  target: ArtifactFileRecord & { artifactId: string };
  /** The artifact as the approval plan saw it; the swap runs only while its visibility and team are unchanged. */
  before: ArtifactRecord;
  approval: VersionedChangeApproval;
  upload: ArtifactFileRecord;
  editorId: string;
  copyId: string;
  versionId: string;
  filename: string;
  harness: HarnessStamp | null;
}

/**
 * The approval outcome's writes, as CTEs after `version` in the swap: they
 * run in the same statement, so the version and its approval stand
 * together. "apply" makes the version the approved one (in `stamped`),
 * cancels open edit requests, and files an approver's audit row; "pending"
 * opens the edit request or points the open one at the version.
 */
function approvalCtes({ approval, target, editorId }: Swap) {
  // The replace's own time, from the database clock (the version's saved_at).
  const at = sql`version.saved_at`;
  if (approval.outcome === "pending") {
    return sql`,
    request as (
      insert into ${sharingRequest} (id, kind, artifact_id, team_id, requested_by, visibility, version_id, status, created_at)
      select ${randomUUID()}, 'edit', ${target.artifactId}, ${approval.teamId}, ${editorId}, ${approval.requestVisibility}, version.id, 'pending', ${at}
      from version
      on conflict (artifact_id, kind) where status = 'pending'
      do update set version_id = excluded.version_id, team_id = excluded.team_id, visibility = excluded.visibility, requested_by = excluded.requested_by, created_at = excluded.created_at
      returning id, (xmax = 0) as opened
    )`;
  }
  if (approval.outcome !== "apply") return sql``;
  const audit = approval.auditTeamId === null ? sql`` : sql`,
    audit as (
      insert into ${sharingRequest} (id, kind, artifact_id, team_id, requested_by, visibility, version_id, status, decided_by, decided_at)
      select ${randomUUID()}, 'edit', ${target.artifactId}, ${approval.auditTeamId}, ${editorId}, ${approval.requestVisibility}, version.id, 'approved', ${editorId}, ${at}
      from version
      returning id
    )`;
  return sql`,
    canceled as (
      update ${sharingRequest} r set status = 'canceled', decided_by = ${editorId}, decided_at = ${at}
      from version
      where r.artifact_id = ${target.artifactId} and r.kind = 'edit' and r.status = 'pending'
      returning r.id
    )${audit}`;
}

/**
 * When the plan applies the change only because the editor's role may
 * approve edits (an approver's own edit, which files an audit row), the
 * swap re-checks that role in its own statement, so an editor demoted since
 * the plan is refused instead of applying unreviewed. The query is
 * uncorrelated with qualified columns (see the tripwire in AGENTS.md).
 */
function roleGuard({ approval, editorId }: Swap) {
  if (approval.outcome !== "apply" || approval.auditTeamId === null) return sql``;
  return sql`
        and a.team_id in (${capabilityHolderTeamQuery(getDb(), editorId, approval.auditTeamId, "approve.edits")})`;
}

/**
 * The swap, in one statement: the production driver (neon-http) has no
 * interactive transactions, and one statement is all or nothing. It runs
 * only while the entry still holds the object the editor saw (`key`), is
 * still a plain attachment of the same artifact, is shown as no icon or
 * cover by the artifact or any version, and the artifact keeps the
 * visibility and team its approval plan was made for (and, when that plan
 * relied on the editor's role, the editor still holds it), and while the upload
 * is still the editor's, finished, and in no artifact. It locks the entry
 * and its artifact, so every part below runs or none does. Then it deletes
 * the upload's row, records what the entry held as an old copy, files the
 * replace's version (saved at the same moment the copy stopped being
 * current: the database clock, as every version's saved_at is, and never
 * before the entry's last replace, so the version shows the new file and every window between
 * replaces holds the version that began it; its size is measured from the
 * row it copies, counting metadata as Postgres prints jsonb, which errs a
 * few bytes high), writes the approval outcome
 * (approvalCtes), stamps the artifact, and points the entry at the upload's
 * object. The upload row goes before the entry takes its key, so the unique
 * key index never sees the key twice. Returns the edit request it opened,
 * if any, or null when nothing ran.
 */
async function swapInUpload(swap: Swap): Promise<{ openedRequestId: string | null } | null> {
  const { target, before, approval, upload, editorId, copyId, versionId, filename, harness } = swap;
  const guard = roleGuard(swap);
  const ref = `${FILE_PREFIX}${target.id}`;
  const harnessId = harness?.harness ?? null;
  const approved = approval.outcome === "apply" ? sql`${versionId}` : sql`a.approved_version_id`;
  const opened = approval.outcome === "pending" ? sql`(select id from request where opened)` : sql`null::text`;
  const result = await getDb().execute<{ id: string; opened_request_id: string | null }>(sql`
    with target as (
      select f.id, f.artifact_id, f.key, f.filename, f.content_type, f.size, f.uploader_id, f.replaced_at
      from ${artifactFile} f
      join ${artifact} a on a.id = f.artifact_id
      where f.id = ${target.id} and f.artifact_id = ${target.artifactId} and f.key = ${target.key}
        and f.status = 'ready' and f.attached_by_content = false
        and a.icon is distinct from ${ref} and a.cover is distinct from ${ref} and coalesce(a.cover, '') not like ${`${ref}@%`}
        and not ${versionShows(target.artifactId, ref)}
        and a.visibility = ${before.visibility} and a.team_id is not distinct from ${before.teamId}${guard}
      for update
    ),
    upload as (
      delete from ${artifactFile} u
      where u.id = ${upload.id} and u.uploader_id = ${editorId} and u.artifact_id is null and u.status = 'ready'
        and exists (select 1 from target)
      returning u.key, u.content_type, u.size, u.uploader_id
    ),
    copy as (
      insert into ${artifactFileCopy} (id, file_id, artifact_id, key, filename, content_type, size, uploader_id, current_from, replaced_at, replaced_by, version_id)
      select ${copyId}, t.id, t.artifact_id, t.key, t.filename, t.content_type, t.size, t.uploader_id, t.replaced_at, greatest(now(), t.replaced_at), ${editorId}, ${versionId}
      from target t, upload
      returning replaced_at
    ),
    version as (
      insert into ${artifactVersion} (id, artifact_id, title, icon, theme, cover, summary, content, kind, language, project, source, metadata, bytes, harness, created_by, save_kind, created_at, saved_at)
      select ${versionId}, a.id, a.title, a.icon, a.theme, a.cover, a.summary, a.content, a.kind, a.language, a.project, a.source, a.metadata,
        octet_length(a.content) + octet_length(a.metadata::text), ${harnessId}, ${editorId}, 'replace', copy.replaced_at, copy.replaced_at
      from ${artifact} a, copy
      where a.id = ${target.artifactId}
      returning id, saved_at
    )${approvalCtes(swap)},
    stamped as (
      update ${artifact} a set updated_by = ${editorId}, updated_at = copy.replaced_at, harness = coalesce(${harnessId}::text, a.harness), approved_version_id = ${approved}
      from version, copy
      where a.id = ${target.artifactId}
      returning a.id
    )
    update ${artifactFile} e
    set key = upload.key, filename = ${filename}, content_type = upload.content_type, size = upload.size, uploader_id = upload.uploader_id, replaced_at = copy.replaced_at
    from upload, copy, version, stamped
    where e.id = ${target.id}
    returning e.id, ${opened} as opened_request_id
  `);
  const [row] = result.rows;
  return row ? { openedRequestId: row.opened_request_id } : null;
}

/** What a replace returns: the artifact it changed, the entry as it is now, and the approval outcome. */
export interface ReplacedFile {
  artifactId: string;
  file: FileDto;
  status: EditStatus;
}

/** Which file to replace with which upload. `artifactId`, when set, is the artifact the file must be in (the page the person is on). */
export interface ReplaceRequest {
  fileId: string;
  uploadId: string;
  artifactId?: string | undefined;
}

/**
 * Replaces `fileId`, a plain attachment of an artifact the editor may edit,
 * with `uploadId`, the editor's own finished upload, and files a version
 * ("Replaced report.pdf") in the same statement. Counts against the
 * per-editor edit limit; the upload already counted against the upload
 * limits and the storage quota. For a link or public artifact the version
 * goes through edit review, and readers outside the team keep the copy that
 * was current at the approved version. Refusals throw a UserFacingError.
 * A refusal leaves the file, its copies, the upload, and any edit request
 * as they were; the caller then discards the upload (removeUnattachedUpload),
 * or reuses it. Steps before the swap may still have run and stay: the
 * history can gain its starting snapshot (ensureHistoryStart), and a link or
 * public artifact with no approved version gets one pinned to its current
 * state (prepareVersionedChange). Both record what the artifact already
 * showed, so readers see no difference.
 */
export async function replaceFile(editorId: string, request: ReplaceRequest, actor: SharingActor, harness: () => Promise<HarnessStamp | null> = noStamp): Promise<ReplacedFile> {
  const target = await editableTarget(editorId, request.fileId, request.artifactId);
  const upload = await usableUpload(editorId, request.uploadId);
  if (upload.id === target.id) throw new UserFacingError(uploadProblem);
  await enforceRateLimit("artifactUpdate", editorId);
  const [before] = await getDb().select().from(artifact).where(eq(artifact.id, target.artifactId)).limit(1);
  if (!before) throw new UserFacingError("File not found.");
  const approvedId = await prepareVersionedChange(before);
  const approval = await planVersionedChangeApproval(before, approvedId, editorId, actor);
  const versionId = randomUUID();
  const swap = { target, before, approval, upload, editorId, copyId: randomUUID(), versionId, filename: replacementFilename(target, upload), harness: await harness() };
  const swapped = await swapInUpload(swap);
  if (!swapped) throw new UserFacingError("The file changed while it was being replaced, so it was not replaced. Try again.");
  await afterSwap(target.artifactId, swapped.openedRequestId);
  const file = await getFileRow(target.id);
  if (!file) throw new UserFacingError("File not found.");
  return { artifactId: target.artifactId, file: toFileDto(file), status: approval.outcome === "pending" ? "pending" : "applied" };
}

/**
 * After the swap: drops the cached artifact (its approved version may have
 * moved), notifies approvers of an edit request the swap opened, and prunes
 * old versions. None of it can undo the replace; pruning is housekeeping
 * the cleanup job retries.
 */
async function afterSwap(artifactId: string, openedRequestId: string | null) {
  forgetArtifactCache(artifactId);
  if (openedRequestId) notifySharingRequest(openedRequestId);
  await pruneArtifactVersions(artifactId).catch((error: unknown) => {
    console.error("[versions] Pruning after a replace failed", error instanceof Error ? error.name : "unknown error");
  });
}
