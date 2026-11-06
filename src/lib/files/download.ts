import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactFileRecord } from "@/db/schema";
import { getArtifactAccess, type ArtifactAccess } from "@/lib/access";

import { canReadFile, type FileArtifactAccess } from "./access-rules";
import { fileLimits, isInlineType } from "./config";
import { contentDisposition } from "./names";
import { presignDownload, r2ConfigFromEnv } from "./r2";
import { listArtifactFiles } from "./store";
import type { FileDto } from "./types";

/**
 * Downloads. Access to a file always goes through its artifact's access
 * check (getArtifactAccess, which loads no content), so whoever can view the artifact can view its
 * files and nobody else can. Unattached files are their uploader's only.
 */

async function loadWithArtifact(fileId: string) {
  const [row] = await getDb()
    .select({ file: artifactFile, publicId: artifact.publicId })
    .from(artifactFile)
    .leftJoin(artifact, eq(artifact.id, artifactFile.artifactId))
    .where(eq(artifactFile.id, fileId))
    .limit(1);
  return row ?? null;
}

/** When the viewer reads an approved version, the time it was saved; otherwise null (they read the latest). */
export function servedVersionTime(viewable: Pick<ArtifactAccess, "version" | "served">): Date | null {
  return viewable.version.source === "approved" ? viewable.served.updatedAt : null;
}

/** The files this viewer may see with the version they are served. */
export async function filesForViewer(viewable: Pick<ArtifactAccess, "record" | "version" | "served">): Promise<FileDto[]> {
  return listArtifactFiles(viewable.record.id, { attachedBy: servedVersionTime(viewable) });
}

async function artifactAccess(publicId: string | null, viewerId: string | null): Promise<FileArtifactAccess | null> {
  if (!publicId) return null;
  const viewable = await getArtifactAccess(publicId, viewerId);
  return viewable ? { viewable: true, servedVersionAt: servedVersionTime(viewable) } : { viewable: false, servedVersionAt: null };
}

/**
 * The file `viewerId` (null when signed out) asked for, or null when it does
 * not exist, is not ready, or they may not read it. Callers answer "not
 * found" for null, so a private file's existence never leaks.
 */
export async function findReadableFile(fileId: string, viewerId: string | null): Promise<ArtifactFileRecord | null> {
  if (!z.uuid().safeParse(fileId).success) return null;
  const row = await loadWithArtifact(fileId.toLowerCase());
  if (!row) return null;
  const access = await artifactAccess(row.publicId, viewerId);
  return canReadFile(row.file, viewerId, access) ? row.file : null;
}

/**
 * A short-lived R2 URL for a readable file. Safe types (images, PDF, video,
 * audio, plain text) open inline unless `download` is set; everything else
 * always downloads as an attachment. R2 answers with our content type.
 */
export async function signedFileUrl(file: Pick<ArtifactFileRecord, "key" | "filename" | "contentType">, options: { download?: boolean } = {}) {
  const inline = !options.download && isInlineType(file.contentType);
  const contentType = file.contentType === "text/plain" ? "text/plain; charset=utf-8" : file.contentType;
  return presignDownload(r2ConfigFromEnv(), {
    key: file.key,
    contentType,
    disposition: contentDisposition(file.filename, inline),
    expiresIn: fileLimits.downloadUrlSeconds,
  });
}
