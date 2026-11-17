"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { getEditableArtifact } from "@/lib/access";
import { publishPageFiles } from "@/lib/page-files/publish";
import { pageBatchLimits } from "@/lib/page-files/publish-rules";
import { requestPageUploads } from "@/lib/page-files/request-uploads";
import { pageFileLimits } from "@/lib/page-files/rules";
import type { EditStatus } from "@/lib/versions/service";
import { UserFacingError } from "@/lib/user-facing-error";

import { editableArtifactDto, runFileAction } from "./file-action-run";

/*
 * Page files from the web app: a person's drop or pick of files on an
 * HTML artifact goes through the batch tools' own service path
 * (src/lib/page-files): the uploads of a set are started in requests of at
 * most pageBatchLimits.maxUploadsPerRequest, the browser PUTs each file and
 * finishes it (finalizeUploadAction), and one publish brings the page's
 * files to the new state with one version. Every action checks the session
 * and edit access first; the limits are the services' own (the hourly
 * upload limit counted once per file, the edit limit once per publish).
 */

const pathSchema = z.string().min(1).max(pageFileLimits.maxPathLength);
const artifactIdSchema = z.string().min(1).max(200);

const requestSchema = z.object({
  artifactId: artifactIdSchema,
  files: z.array(z.object({ path: pathSchema, size: z.number().int().positive() })).min(1).max(pageBatchLimits.maxUploadsPerRequest),
});

const publishSchema = z.object({
  artifactId: artifactIdSchema,
  uploadIds: z.array(z.uuid()).max(pageBatchLimits.maxFilesPerPublish),
  remove: z.array(pathSchema).max(pageBatchLimits.maxFilesPerPublish),
}).refine((input) => input.uploadIds.length > 0 || input.remove.length > 0, { message: "Choose a file to add or remove." });

/** One started upload of a page file: the path it is for, its id, and where and how to PUT its bytes. */
export interface PageUploadTicket {
  path: string;
  fileId: string;
  url: string;
  headers: Record<string, string>;
}

/** What a publish did, and the artifact as its editor sees it now. */
export interface PublishedPageFiles {
  artifact: ArtifactDto;
  /** "pending" when the change waits for a team owner's or admin's approval. */
  status: EditStatus;
  added: string[];
  replaced: string[];
  removed: string[];
}

async function editableRecord(userId: string, artifactId: string) {
  const record = await getEditableArtifact(userId, { id: artifactId });
  if (!record) throw new UserFacingError("Artifact not found.");
  return record;
}

/**
 * Starts the uploads of some of a set of page files for an HTML artifact
 * the person may edit (requestPageUploads): every path and size is checked
 * against the page first, then the waiting uploads, the hourly limit (once
 * per file), and the storage quota, before any address is signed. A path
 * the page has is fine: the publish replaces that file.
 */
export async function requestPageUploadsAction(input: { artifactId: string; files: { path: string; size: number }[] }): Promise<ActionResult<PageUploadTicket[]>> {
  return runFileAction("The uploads could not start. Try again.", async (userId) => {
    const { artifactId, files } = requestSchema.parse(input);
    const record = await editableRecord(userId, artifactId);
    const started = await requestPageUploads(userId, { artifact: record, files, remove: [] });
    return started.map(({ path, fileId, upload }) => ({ path, fileId, url: upload.url, headers: upload.headers }));
  });
}

/**
 * Publishes the person's finished page file uploads to an HTML artifact
 * they may edit, and removes the named paths, in one statement with one
 * version (publishPageFiles): it lands whole or not at all. A shared
 * artifact's change goes through approval as any save does.
 */
export async function publishPageFilesAction(input: { artifactId: string; uploadIds: string[]; remove: string[] }): Promise<ActionResult<PublishedPageFiles>> {
  return runFileAction("The files could not be added. Try again.", async (userId) => {
    const { artifactId, uploadIds, remove } = publishSchema.parse(input);
    const record = await editableRecord(userId, artifactId);
    const published = await publishPageFiles(userId, { artifactId: record.id, uploadIds, remove }, "person");
    revalidatePath("/app");
    const { status, added, replaced, removed } = published;
    return { artifact: await editableArtifactDto(userId, record.id), status, added, replaced, removed };
  });
}
