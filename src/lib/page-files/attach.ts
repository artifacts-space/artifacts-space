import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, type ArtifactFileRecord } from "@/db/schema";
import { getFileRows } from "@/lib/files/store";
import { UserFacingError } from "@/lib/user-facing-error";

import { pageFileLimits, pageFileTotalsProblem } from "./rules";
import { attachPageFilesWithinLimits, pageFilePaths, pageFileTotals } from "./store";

/**
 * Attaching page files. An upload requested with a page path becomes a page
 * file of an HTML artifact the editor may edit, and nothing else. Callers
 * check that the editor may edit the artifact (getEditableArtifact), count
 * the edit against the editor's limit, and record the change
 * (src/lib/files/attach.ts). The checks here give a clear refusal; the
 * attach statement holds the same rules by itself (store.ts).
 */

/** An upload that was requested as a page file. */
export type PageUpload = ArtifactFileRecord & { pagePath: string };

function isPageUpload(row: ArtifactFileRecord): row is PageUpload {
  return typeof row.pagePath === "string";
}

/** Among these file ids, the editor's own finished uploads in no artifact that were requested as page files. */
export async function pageUploadsAmong(editorId: string, fileIds: readonly string[]): Promise<PageUpload[]> {
  const ids = [...new Set(fileIds.map((id) => id.toLowerCase()))];
  if (ids.length === 0 || ids.length > pageFileLimits.maxFiles) return [];
  const rows = await getFileRows(ids);
  return rows.filter(isPageUpload).filter((row) => row.artifactId === null && row.uploaderId === editorId && row.status === "ready");
}

/** The first path that two of these files would share, counting paths that differ only by letter case as one, or null. */
export function sharedPagePath(existing: readonly { pagePath: string }[], adding: readonly { pagePath: string }[]): string | null {
  const taken = new Set(existing.map((file) => file.pagePath.toLowerCase()));
  for (const file of adding) {
    const key = file.pagePath.toLowerCase();
    if (taken.has(key)) return file.pagePath;
    taken.add(key);
  }
  return null;
}

async function assertHtmlArtifact(artifactId: string): Promise<void> {
  const [row] = await getDb().select({ kind: artifact.kind }).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (row?.kind !== "html") throw new UserFacingError('Page files belong to an HTML artifact (kind "html"). This artifact is another format; upload the file without pagePath to attach it as a plain file.');
}

/**
 * Attaches the editor's page file uploads to an HTML artifact.
 * Refuses, with the reason, an artifact of another format, a path the page
 * already has (or one that differs from it only by letter case), and files
 * that would take the artifact over the page file limits. Returns how many
 * were attached.
 */
export async function attachPageUploads(editorId: string, artifactId: string, uploads: readonly PageUpload[]): Promise<number> {
  if (uploads.length === 0) return 0;
  await assertHtmlArtifact(artifactId);
  const [existing, totals] = await Promise.all([pageFilePaths(artifactId), pageFileTotals(artifactId)]);
  const shared = sharedPagePath(existing, uploads);
  if (shared) throw new UserFacingError(`The page already has a file at ${shared}, or at a path that differs only by upper and lower case. Replace that file (files_replace) or delete it first.`);
  const problem = pageFileTotalsProblem({ count: totals.count + uploads.length, bytes: totals.bytes + uploads.reduce((sum, upload) => sum + upload.size, 0) });
  if (problem) throw new UserFacingError(problem);
  const attached = await attachPageFilesWithinLimits(editorId, artifactId, uploads.map((upload) => upload.id));
  if (attached.length === 0) throw new UserFacingError("The page files could not be attached: the uploads or the artifact changed meanwhile. Read the artifact and try again.");
  return attached.length;
}
