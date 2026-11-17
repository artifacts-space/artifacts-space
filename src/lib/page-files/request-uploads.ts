import { randomUUID } from "node:crypto";

import { getDb } from "@/db";
import { artifactFile } from "@/db/schema";
import { enforceRateLimitHits } from "@/lib/abuse/rate-limit";
import { fileLimits } from "@/lib/files/config";
import { fileObjectKey, sanitizeFilename } from "@/lib/files/names";
import { presignUpload, r2ConfigFromEnv, type PresignedUpload } from "@/lib/files/r2";
import { countPendingUploads } from "@/lib/files/store";
import { assertFileFits } from "@/lib/quota/usage";
import { UserFacingError } from "@/lib/user-facing-error";

import { heldPageFiles } from "./publish";
import { faultsMessage, pageBatchLimits, planPagePublish, type RequestedPageFile } from "./publish-rules";
import { pageFileName, pageFileTypeFor } from "./rules";

/**
 * Starting the uploads of a whole set of page files in one call. The set
 * is checked against the page as a whole before any address is signed, so
 * one refusal names every file to fix and nothing is half started. Callers
 * check that the editor may edit the artifact (getEditableArtifact).
 */

/** The set to upload: the HTML artifact it is for, its files, and the held paths the same publish will remove. */
export interface PageUploadsRequest {
  artifact: { id: string; kind: string };
  files: readonly RequestedPageFile[];
  /** Paths the publish will remove. They only make room in the limits here; nothing is removed until the publish. */
  remove: readonly string[];
}

/** One started upload: the path it is for, its id, and where and how to PUT its bytes. */
export interface StartedPageUpload {
  path: string;
  fileId: string;
  size: number;
  contentType: string;
  upload: PresignedUpload;
}

interface Planned {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  file: RequestedPageFile;
}

function planned(file: RequestedPageFile): Planned {
  const type = pageFileTypeFor(file.path);
  // The set passed planPagePublish, which checks every path; this guards the type lookup alone.
  if (!type) throw new UserFacingError(`${file.path} cannot be a page file.`);
  const id = randomUUID();
  const filename = sanitizeFilename(pageFileName(file.path));
  return { id, key: fileObjectKey(id, filename), filename, contentType: type.contentType, file };
}

/** Refuses a set that would leave the editor with more uploads waiting to finish than pageBatchLimits allows. */
async function assertPendingRoom(editorId: string, adding: number): Promise<void> {
  const waiting = await countPendingUploads(editorId);
  if (waiting + adding <= pageBatchLimits.maxPendingUploads) return;
  throw new UserFacingError(
    `You have ${String(waiting)} uploads waiting to finish, and this call asks for ${String(adding)} more. At most ${String(pageBatchLimits.maxPendingUploads)} may wait at once. Publish or delete the ones you started (page_files_publish, files_delete), or wait an hour for them to lapse, then ask again.`,
  );
}

/**
 * Starts the uploads of a set of page files for an HTML artifact. In this
 * order, and before any address is signed: every path and size is checked,
 * and the page's limits are checked for the page as the set (and the
 * removals) would leave it, with one refusal that names every file at
 * fault; then the uploads waiting to finish, the hourly limit (counted per
 * file), and the storage quota for the set's total size. Then one address
 * is signed per file and all the pending rows are stored in one insert. A
 * path the page already has is fine: publishing replaces that file.
 */
export async function requestPageUploads(editorId: string, request: PageUploadsRequest): Promise<StartedPageUpload[]> {
  if (request.artifact.kind !== "html") throw new UserFacingError('Page files belong to an HTML artifact (kind "html"). This artifact is another format; upload a plain attachment with files_request_upload.');
  const check = planPagePublish(request.files, request.remove, await heldPageFiles(request.artifact.id));
  if (!check.ok) throw new UserFacingError(faultsMessage("No upload was started. Fix these, then ask again with the whole set:", check.faults));
  await assertPendingRoom(editorId, request.files.length);
  await enforceRateLimitHits("pageFileUpload", editorId, request.files.length);
  await assertFileFits(editorId, request.files.reduce((sum, file) => sum + file.size, 0));
  const config = r2ConfigFromEnv();
  const plans = request.files.map(planned);
  const uploads = await Promise.all(plans.map((plan) => presignUpload(config, { key: plan.key, contentType: plan.contentType, size: plan.file.size, expiresIn: fileLimits.uploadUrlSeconds })));
  await getDb()
    .insert(artifactFile)
    .values(plans.map((plan) => ({ id: plan.id, uploaderId: editorId, key: plan.key, filename: plan.filename, contentType: plan.contentType, size: plan.file.size, status: "pending" as const, pagePath: plan.file.path })));
  return plans.flatMap((plan, index) => {
    const upload = uploads[index];
    return upload ? [{ path: plan.file.path, fileId: plan.id, size: plan.file.size, contentType: plan.contentType, upload }] : [];
  });
}
