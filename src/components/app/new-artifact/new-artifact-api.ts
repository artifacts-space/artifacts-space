import { loadArtifactAction, updateArtifactAction } from "@/app/(workspace)/app/actions";
import { attachFilesAction, createArtifactWithFilesAction, discardUploadAction, replaceFileAction } from "@/app/(workspace)/app/file-actions";
import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { sendToServer, type SendFile } from "@/components/files/use-file-uploads";
import type { ActionResult, ArtifactDto, ArtifactInput } from "@/lib/artifact-types";

/**
 * What the blank page calls to store a new artifact: the server actions,
 * which check the session, validate with zod, and rate-limit every call; or
 * the /dev/workspace fixture's stand-in, which needs no database.
 */
export interface NewArtifactApi {
  /** Creates the artifact once per `requestId` (one per blank page), with any dropped files attached. */
  create: (input: ArtifactInput, fileIds: string[], requestId: string) => Promise<ActionResult<ArtifactDto>>;
  /** Every save after the create. */
  update: SaveArtifact;
  /** Uploads one dropped or picked file. */
  send: SendFile;
  /** Attaches finished uploads to the artifact once it is stored (files dropped after a title was typed). */
  attach: (artifactId: string, fileIds: string[]) => Promise<ActionResult<ArtifactDto>>;
  /** Replaces a file of the stored artifact with a finished upload, from its Files section. */
  replace: (artifactId: string, fileId: string, uploadId: string) => Promise<ActionResult<ArtifactDto>>;
  /** Deletes an upload that never reached an artifact; one already in an artifact is left alone. */
  discard: (fileId: string) => Promise<unknown>;
  /** The stored artifact as it is now, by public id: the workspace's own loader (loadArtifactAction), used when an answer was lost. */
  load: (publicId: string) => Promise<ActionResult<ArtifactDto>>;
}

/** The server actions behind the blank page. */
export const serverNewArtifactApi: NewArtifactApi = {
  create: (input, fileIds, requestId) => createArtifactWithFilesAction(input, fileIds, requestId),
  update: (id, changes, options) => updateArtifactAction(id, changes, options),
  send: sendToServer,
  attach: (artifactId, fileIds) => attachFilesAction(artifactId, fileIds),
  replace: (artifactId, fileId, uploadId) => replaceFileAction(artifactId, fileId, uploadId),
  discard: (fileId) => discardUploadAction(fileId),
  load: (publicId) => loadArtifactAction(publicId),
};
