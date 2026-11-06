import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifactFile, type ArtifactFileRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { assertFileFits } from "@/lib/quota/usage";
import { UserFacingError } from "@/lib/user-facing-error";

import { checkUpload, fileLimits, isAllowedFileType } from "./config";
import { fileObjectKey, sanitizeFilename } from "./names";
import { headObject, presignUpload, r2ConfigFromEnv, readObjectStart, type PresignedUpload } from "./r2";
import { matchesFileSignature, signatureBytes } from "./signature";
import { countPendingUploads, getFileRow, removeFiles, toFileDto } from "./store";
import type { FileDto } from "./types";

/**
 * The upload flow. 1: requestUpload checks the size and type, stores a
 * pending row, and returns a presigned PUT. 2: the client or agent PUTs the
 * bytes straight to R2 with exactly the returned headers. 3: finalizeUpload
 * checks the stored object's size, type, and first bytes, and marks it ready.
 */

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1, "Give the file a name.").max(255),
  contentType: z.string().trim().max(255).optional(),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type UploadRequest = z.input<typeof uploadRequestSchema>;

/** A started upload: the pending file and where to PUT its bytes. */
export interface StartedUpload {
  file: FileDto;
  upload: PresignedUpload;
}

/**
 * Starts an upload for `uploaderId`. Refuses files over the size cap, types
 * that are not allowed, more than 20 unfinished uploads at once, more than
 * the hourly upload limit, and files that would go over the account's
 * storage quota.
 */
export async function requestUpload(uploaderId: string, input: UploadRequest): Promise<StartedUpload> {
  const parsed = uploadRequestSchema.parse(input);
  const check = checkUpload(parsed);
  if (!check.ok) throw new UserFacingError(check.error);
  if ((await countPendingUploads(uploaderId)) >= fileLimits.maxPendingPerUser) {
    throw new UserFacingError("You have many unfinished uploads. Finish or remove them, then try again.");
  }
  await enforceRateLimit("fileUpload", uploaderId);
  await assertFileFits(uploaderId, parsed.size);
  const id = randomUUID();
  const filename = sanitizeFilename(parsed.filename);
  const key = fileObjectKey(id, filename);
  const upload = await presignUpload(r2ConfigFromEnv(), { key, contentType: check.contentType, size: parsed.size, expiresIn: fileLimits.uploadUrlSeconds });
  const [row] = await getDb()
    .insert(artifactFile)
    .values({ id, uploaderId, key, filename, contentType: check.contentType, size: parsed.size, status: "pending" })
    .returning();
  if (!row) throw new Error("The upload could not be started.");
  return { file: toFileDto(row), upload };
}

/** Why a stored object does not match its upload request, or null when it does. */
export function storedObjectProblem(row: Pick<ArtifactFileRecord, "size" | "contentType">, stored: { size: number; contentType: string }): string | null {
  if (stored.size !== row.size) return `The stored file is ${String(stored.size)} bytes, but the upload said ${String(row.size)}.`;
  const storedType = (stored.contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (storedType !== row.contentType) return `The stored file is ${storedType || "untyped"}, but the upload said ${row.contentType}.`;
  return null;
}

async function rejectUpload(row: ArtifactFileRecord, reason: string): Promise<never> {
  await removeFiles([row]);
  throw new UserFacingError(`The upload was refused and removed. ${reason} Request a new upload and try again.`);
}

async function ownPendingOrReady(uploaderId: string, fileId: string) {
  if (!z.uuid().safeParse(fileId).success) throw new UserFacingError("File not found.");
  const row = await getFileRow(fileId);
  if (row?.uploaderId !== uploaderId) throw new UserFacingError("File not found.");
  return row;
}

/**
 * Checks an uploaded object and marks it ready. Finalizing a ready file
 * returns it unchanged. A file whose size, type, or first bytes do not
 * match the request is deleted.
 */
export async function finalizeUpload(uploaderId: string, fileId: string): Promise<FileDto> {
  const row = await ownPendingOrReady(uploaderId, fileId);
  if (row.status === "ready") return toFileDto(row);
  const config = r2ConfigFromEnv();
  const stored = await headObject(config, row.key);
  if (!stored) throw new UserFacingError("The file has not arrived yet. PUT it to the upload URL with the returned headers, then finalize again.");
  const problem = storedObjectProblem(row, stored);
  if (problem) return rejectUpload(row, problem);
  if (!isAllowedFileType(row.contentType)) return rejectUpload(row, "This file type is not supported.");
  const start = await readObjectStart(config, row.key, signatureBytes);
  if (!matchesFileSignature(row.contentType, start)) return rejectUpload(row, `The file's content does not look like ${row.contentType}.`);
  const [ready] = await getDb()
    .update(artifactFile)
    .set({ status: "ready" })
    .where(and(eq(artifactFile.id, row.id), eq(artifactFile.uploaderId, uploaderId)))
    .returning();
  if (!ready) throw new UserFacingError("File not found.");
  return toFileDto(ready);
}
