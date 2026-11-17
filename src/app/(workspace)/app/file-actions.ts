"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult, ArtifactDto, ArtifactInput } from "@/lib/artifact-types";
import { getEditableArtifact } from "@/lib/access";
import { createArtifactOnce } from "@/lib/create/create-once";
import { attachFiles, deleteOwnFile, discardUnattachedUpload } from "@/lib/files/attach";
import { replaceFile } from "@/lib/files/replace";
import type { FileDto } from "@/lib/files/types";
import { finalizeUpload, requestUpload, type UploadRequest } from "@/lib/files/uploads";
import { UserFacingError } from "@/lib/user-facing-error";

import { editableArtifactDto, runFileAction as run } from "./file-action-run";

/** What the browser needs to PUT one file to R2. */
export interface UploadTicket {
  fileId: string;
  url: string;
  headers: Record<string, string>;
}

const fileIdsSchema = z.array(z.uuid()).max(20);
const createRequestIdSchema = z.uuid().nullable();

/** Starts an upload: checks size and type, and returns a presigned PUT. */
export async function requestUploadAction(input: UploadRequest): Promise<ActionResult<UploadTicket>> {
  return run("The upload could not start. Try again.", async (userId) => {
    const { file, upload } = await requestUpload(userId, input);
    return { fileId: file.id, url: upload.url, headers: upload.headers };
  });
}

/** Checks an uploaded file and makes it usable. */
export async function finalizeUploadAction(fileId: string): Promise<ActionResult<FileDto>> {
  return run("The upload could not be checked. Try again.", (userId) => finalizeUpload(userId, fileId));
}

/** Deletes one of the person's own uploads, or a file from an artifact they may edit. */
export async function deleteFileAction(fileId: string): Promise<ActionResult<ArtifactDto | null>> {
  return run("The file could not be removed. Try again.", async (userId) => {
    const { artifactId } = await deleteOwnFile(userId, fileId, "person");
    if (!artifactId) return null;
    revalidatePath("/app");
    return editableArtifactDto(userId, artifactId);
  });
}

/**
 * Deletes one of the person's own uploads only while it is in no artifact:
 * what a blank page sends for files that never reached one. A file already
 * attached (a create or attach whose answer was lost) is left alone.
 */
export async function discardUploadAction(fileId: string): Promise<ActionResult<null>> {
  return run("The file could not be removed. Try again.", async (userId) => {
    await discardUnattachedUpload(userId, z.uuid().parse(fileId));
    return null;
  });
}

/** Adds finished uploads to an artifact the person may edit. */
export async function attachFilesAction(artifactId: string, fileIds: string[]): Promise<ActionResult<ArtifactDto>> {
  return run("The files could not be added. Try again.", async (userId) => {
    const ids = fileIdsSchema.parse(fileIds);
    const record = await getEditableArtifact(userId, { id: artifactId });
    if (!record) throw new UserFacingError("Artifact not found.");
    await attachFiles(userId, record.id, ids, "person");
    revalidatePath("/app");
    return editableArtifactDto(userId, record.id);
  });
}

/**
 * Replaces a file of an artifact the person may edit with their finished
 * upload. The file keeps its id, place, and name; the old copy stays in
 * History. A refusal leaves the file as it was (replaceFile says what else
 * may be recorded); the page then discards the upload.
 */
export async function replaceFileAction(artifactId: string, fileId: string, uploadId: string): Promise<ActionResult<ArtifactDto>> {
  return run("The file could not be replaced. Try again.", async (userId) => {
    const ids = z.object({ fileId: z.uuid(), uploadId: z.uuid() }).parse({ fileId, uploadId });
    const record = await getEditableArtifact(userId, { id: z.string().min(1).max(200).parse(artifactId) });
    if (!record) throw new UserFacingError("Artifact not found.");
    await replaceFile(userId, { ...ids, artifactId: record.id }, "person");
    revalidatePath("/app");
    return editableArtifactDto(userId, record.id);
  });
}

/**
 * Creates an artifact and attaches finished uploads to it: the blank page's
 * create (createArtifactOnce). `requestId` is the page's create id, one per
 * blank page, so a retry after a lost response hands back the artifact the
 * first try stored instead of making two.
 */
export async function createArtifactWithFilesAction(input: ArtifactInput, fileIds: string[], requestId?: string | null): Promise<ActionResult<ArtifactDto>> {
  return run("The artifact could not be saved. Please try again.", async (userId) => {
    const ids = fileIdsSchema.parse(fileIds);
    const request = createRequestIdSchema.parse(requestId ?? null);
    const { id } = await createArtifactOnce(userId, input, ids, request);
    revalidatePath("/app");
    return editableArtifactDto(userId, id);
  });
}
