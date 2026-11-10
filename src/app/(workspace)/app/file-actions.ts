"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactDto, ArtifactInput } from "@/lib/artifact-types";
import { getEditableArtifact } from "@/lib/access";
import { toArtifactDtos } from "@/lib/artifacts";
import { createArtifactOnce } from "@/lib/create/create-once";
import { attachFiles, deleteOwnFile, discardUnattachedUpload } from "@/lib/files/attach";
import type { FileDto } from "@/lib/files/types";
import { finalizeUpload, requestUpload, type UploadRequest } from "@/lib/files/uploads";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

/** What the browser needs to PUT one file to R2. */
export interface UploadTicket {
  fileId: string;
  url: string;
  headers: Record<string, string>;
}

const fileIdsSchema = z.array(z.uuid()).max(20);
const createRequestIdSchema = z.uuid().nullable();

async function run<T>(fallback: string, action: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    return { success: true, data: await action(session.user.id) };
  } catch (error) {
    if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
      console.error("[files] Action failed", error instanceof Error ? error.name : "unknown error");
    }
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

async function editableArtifactDto(userId: string, artifactId: string): Promise<ArtifactDto> {
  const record = await getEditableArtifact(userId, { id: artifactId });
  if (!record) throw new UserFacingError("Artifact not found.");
  const [dto] = await toArtifactDtos([record], userId);
  if (!dto) throw new UserFacingError("Artifact not found.");
  return dto;
}

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
    const artifactId = await deleteOwnFile(userId, fileId, "person");
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
