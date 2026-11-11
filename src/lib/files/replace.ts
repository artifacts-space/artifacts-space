import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifactFileCopy } from "@/db/file-copy-schema";
import { artifact, artifactFile, artifactVersion, type ArtifactFileRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifactMeta } from "@/lib/access";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import type { SharingActor } from "@/lib/sharing/rules";
import { UserFacingError } from "@/lib/user-facing-error";
import { versionBytes } from "@/lib/versions/history-rules";
import { prepareVersionedChange, settleVersionedChange, type EditStatus } from "@/lib/versions/service";

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
 * the current file exactly as it was. The upload was checked and counted
 * like any other (files_request_upload, files_finalize).
 */

const uploadProblem =
  "The new file is unknown, still uploading, or not yours to use. Upload it (files_request_upload, PUT, files_finalize) and use the id you get back.";

/** No harness: a change in the web app. */
const noStamp = () => Promise.resolve(null);

/** Whether any version, or the artifact now, shows this file as its icon or cover. Such images are changed through their pickers. */
async function shownAsIconOrCover(artifactId: string, fileId: string): Promise<boolean> {
  const ref = `${FILE_PREFIX}${fileId}`;
  const result = await getDb().execute<{ shown: boolean }>(sql`
    select exists (select 1 from ${artifact} a where a.id = ${artifactId} and (a.icon = ${ref} or a.cover = ${ref} or a.cover like ${`${ref}@%`}))
      or exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and (v.icon = ${ref} or v.cover = ${ref} or v.cover like ${`${ref}@%`})) as shown
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
  upload: ArtifactFileRecord;
  editorId: string;
  copyId: string;
  versionId: string;
  filename: string;
  /** The version's content and metadata size, from the artifact before the replace (a replace changes neither). */
  bytes: number;
  harness: HarnessStamp | null;
}

/**
 * The swap, in one statement: the production driver (neon-http) has no
 * interactive transactions, and one statement is all or nothing. It runs
 * only while the entry still holds the object the editor saw (`key`), is
 * still a plain attachment of the same artifact, and is shown as no icon or
 * cover, and while the upload is still the editor's, finished, and in no
 * artifact. It locks the entry and its artifact, so every part below runs or
 * none does. Then it deletes the upload's row, records what the entry held
 * as an old copy, files the replace's version (saved at the same moment the
 * copy stopped being current, so the version shows the new file and every
 * window between replaces holds the version that began it), stamps the
 * artifact, and points the entry at the upload's object. The upload row goes
 * before the entry takes its key, so the unique key index never sees the
 * key twice. Returns the updated entry, or null when nothing ran.
 */
async function swapInUpload({ target, upload, editorId, copyId, versionId, filename, bytes, harness }: Swap): Promise<ArtifactFileRecord | null> {
  const ref = `${FILE_PREFIX}${target.id}`;
  const harnessId = harness?.harness ?? null;
  const result = await getDb().execute<{ id: string }>(sql`
    with target as (
      select f.id, f.artifact_id, f.key, f.filename, f.content_type, f.size, f.uploader_id, f.replaced_at
      from ${artifactFile} f
      join ${artifact} a on a.id = f.artifact_id
      where f.id = ${target.id} and f.artifact_id = ${target.artifactId} and f.key = ${target.key}
        and f.status = 'ready' and f.attached_by_content = false
        and a.icon is distinct from ${ref} and a.cover is distinct from ${ref} and coalesce(a.cover, '') not like ${`${ref}@%`}
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
      select ${copyId}, t.id, t.artifact_id, t.key, t.filename, t.content_type, t.size, t.uploader_id, t.replaced_at, now(), ${editorId}, ${versionId}
      from target t, upload
      returning replaced_at
    ),
    version as (
      insert into ${artifactVersion} (id, artifact_id, title, icon, theme, cover, summary, content, kind, language, project, source, metadata, bytes, harness, created_by, save_kind, created_at, saved_at)
      select ${versionId}, a.id, a.title, a.icon, a.theme, a.cover, a.summary, a.content, a.kind, a.language, a.project, a.source, a.metadata, ${bytes}, ${harnessId}, ${editorId}, 'replace', copy.replaced_at, copy.replaced_at
      from ${artifact} a, copy
      where a.id = ${target.artifactId}
      returning id
    ),
    stamped as (
      update ${artifact} a set updated_by = ${editorId}, updated_at = now(), harness = coalesce(${harnessId}::text, a.harness)
      from version
      where a.id = ${target.artifactId}
      returning a.id
    )
    update ${artifactFile} e
    set key = upload.key, filename = ${filename}, content_type = upload.content_type, size = upload.size, uploader_id = upload.uploader_id, replaced_at = copy.replaced_at
    from upload, copy, version, stamped
    where e.id = ${target.id}
    returning e.id
  `);
  if (result.rows.length === 0) return null;
  return getFileRow(target.id);
}

/** What a replace returns: the artifact it changed and the entry as it is now. */
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
 * was current at the approved version. Refusals throw a UserFacingError and
 * change nothing; the caller then discards the upload
 * (removeUnattachedUpload), or reuses it.
 */
export async function replaceFile(editorId: string, request: ReplaceRequest, actor: SharingActor, harness: () => Promise<HarnessStamp | null> = noStamp): Promise<ReplacedFile> {
  const target = await editableTarget(editorId, request.fileId, request.artifactId);
  const upload = await usableUpload(editorId, request.uploadId);
  if (upload.id === target.id) throw new UserFacingError(uploadProblem);
  await enforceRateLimit("artifactUpdate", editorId);
  const [before] = await getDb().select().from(artifact).where(eq(artifact.id, target.artifactId)).limit(1);
  if (!before) throw new UserFacingError("File not found.");
  const approvedId = await prepareVersionedChange(before);
  const versionId = randomUUID();
  const swap = { target, upload, editorId, copyId: randomUUID(), versionId, filename: replacementFilename(target, upload), bytes: versionBytes(before), harness: await harness() };
  const swapped = await swapInUpload(swap);
  if (!swapped) throw new UserFacingError("The file changed while it was being replaced, so nothing was changed. Try again.");
  const status = await settleReplace({ artifactId: target.artifactId, approvedId, versionId, editorId, actor });
  return { artifactId: target.artifactId, file: toFileDto(swapped), status };
}

/**
 * Applies the approval rule to the replace's version, trying twice. The file
 * and its version are already saved; if both tries fail, readers outside the
 * team keep the approved copy, and the caller hears that the request for
 * approval was not sent.
 */
async function settleReplace(input: Parameters<typeof settleVersionedChange>[0]): Promise<EditStatus> {
  try {
    return await settleVersionedChange(input);
  } catch {
    try {
      return await settleVersionedChange(input);
    } catch (error) {
      console.error("[files] A replaced file's approval step failed", error instanceof Error ? error.name : "unknown error");
      throw new UserFacingError("The file was replaced and History has it, but it could not be sent for approval. Readers outside the team keep the approved file until a later change is approved.");
    }
  }
}
