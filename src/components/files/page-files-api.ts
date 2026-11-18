import { discardUploadAction, finalizeUploadAction } from "@/app/(workspace)/app/file-actions";
import { publishPageFilesAction, requestPageUploadsAction, type PageUploadTicket, type PublishedPageFiles } from "@/app/(workspace)/app/page-file-actions";
import type { ActionResult } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import { putFile } from "./put-file";
import type { ZipReader } from "./unpack-drop";

/**
 * Where an HTML artifact's page files go from the web app: the batch
 * tools' service path through the server actions, or the /dev/editor
 * fixture's stand-in that keeps them in the tab.
 */
export interface PageFilesApi {
  /** Starts the uploads of some files of a set (at most pageBatchLimits.maxUploadsPerRequest). */
  request: (input: { artifactId: string; files: { path: string; size: number }[] }) => Promise<ActionResult<PageUploadTicket[]>>;
  /** Sends one file's bytes to its ticket's address; aborting `signal` stops the request. */
  put: (ticket: PageUploadTicket, file: File, onProgress: (percent: number) => void, signal: AbortSignal) => Promise<void>;
  /** Checks one sent file (its size, type, and first bytes) and makes it ready to publish. */
  finalize: (fileId: string) => Promise<ActionResult<FileDto>>;
  /** Adds and replaces with these finished uploads, and removes these paths, in one version. */
  publish: (input: { artifactId: string; uploadIds: string[]; remove: string[] }) => Promise<ActionResult<PublishedPageFiles>>;
  /** Deletes an upload that never reached the page. A file already in an artifact is left alone. */
  discard: (fileId: string) => Promise<unknown>;
  /** Reads a dropped zip's entries in the browser; readZip unless a fixture hands its own. */
  readZip?: ZipReader;
}

export const serverPageFilesApi: PageFilesApi = {
  request: requestPageUploadsAction,
  put: (ticket, file, onProgress, signal) => putFile(ticket.url, ticket.headers, file, onProgress, signal),
  finalize: finalizeUploadAction,
  publish: publishPageFilesAction,
  discard: discardUploadAction,
};
