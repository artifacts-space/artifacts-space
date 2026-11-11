import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactFileRecord } from "@/db/schema";
import { getArtifactAccess, type ArtifactAccess } from "@/lib/access";

import { canReadFile, type FileArtifactAccess } from "./access-rules";
import { fileLimits, isInlineType } from "./config";
import { copiesCurrentAt } from "./copies";
import { contentDisposition } from "./names";
import { presignDownload, r2ConfigFromEnv } from "./r2";
import { replacedSince } from "./replace-rules";
import { fileHiddenFor, hiddenImagesFor } from "./served-images";
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

/**
 * The files this viewer may see with the version they are served: never an
 * old icon or cover image, or a file the content once embedded, that this
 * version does not show. Which files to hide is asked only when there are
 * files, so a page without files costs one query here.
 */
export async function filesForViewer(viewable: Pick<ArtifactAccess, "record" | "version" | "served">): Promise<FileDto[]> {
  const servedAt = servedVersionTime(viewable);
  const files = await listArtifactFiles(viewable.record.id, { attachedBy: servedAt });
  if (files.length === 0) return [];
  const hidden = await hiddenImagesFor(viewable);
  const shown = hidden.size === 0 ? files : files.filter((file) => !hidden.has(file.id));
  return (servedAt ? await asServedAt(shown, servedAt) : shown).map(forReaders);
}

/** A file as readers get it: what it is, without the editing flags (embedded, pictured) only the Files section uses. */
function forReaders({ id, filename, contentType, size, createdAt, replacedAt }: FileDto): FileDto {
  return { id, filename, contentType, size, createdAt, replacedAt };
}

/**
 * The files as they were at `servedAt`, for readers of an approved version:
 * a file replaced since then shows the copy that was current then, and is
 * left out if that copy is gone. Never the newer, unapproved file.
 */
async function asServedAt(files: readonly FileDto[], servedAt: Date): Promise<FileDto[]> {
  const replaced = files.filter((file) => replacedSince({ replacedAt: file.replacedAt ? new Date(file.replacedAt) : null }, servedAt));
  if (replaced.length === 0) return [...files];
  const replacedIds = new Set(replaced.map((file) => file.id));
  const copies = await copiesCurrentAt([...replacedIds], servedAt);
  return files.flatMap((file) => {
    if (!replacedIds.has(file.id)) return [file];
    const copy = copies.get(file.id);
    return copy ? [{ ...file, filename: copy.filename, contentType: copy.contentType, size: copy.size, replacedAt: copy.currentFrom?.toISOString() ?? null }] : [];
  });
}

/** One file as a reader of the version saved at `servedAt` gets it (see asServedAt), or null when its copy from then is gone. */
async function fileServedAt(file: ArtifactFileRecord, servedAt: Date | null): Promise<ArtifactFileRecord | null> {
  if (!servedAt || !replacedSince(file, servedAt)) return file;
  const copy = (await copiesCurrentAt([file.id], servedAt)).get(file.id);
  if (!copy) return null;
  return { ...file, key: copy.key, filename: copy.filename, contentType: copy.contentType, size: copy.size, uploaderId: copy.uploaderId, replacedAt: copy.currentFrom };
}

/** One file request: asks only about this file, so a page with many media does not recompute the artifact's hidden set per file. */
async function artifactAccess(file: ArtifactFileRecord, publicId: string | null, viewerId: string | null): Promise<FileArtifactAccess | null> {
  if (!publicId) return null;
  const viewable = await getArtifactAccess(publicId, viewerId);
  if (!viewable) return { viewable: false, servedVersionAt: null, hiddenImage: false };
  return { viewable: true, servedVersionAt: servedVersionTime(viewable), hiddenImage: await fileHiddenFor(viewable, file) };
}

/**
 * The file `viewerId` (null when signed out) asked for, or null when it does
 * not exist, is not ready, or they may not read it. A reader of an approved
 * version gets the file as that version showed it (fileServedAt). Callers
 * answer "not found" for null, so a private file's existence never leaks.
 */
export async function findReadableFile(fileId: string, viewerId: string | null): Promise<ArtifactFileRecord | null> {
  if (!z.uuid().safeParse(fileId).success) return null;
  const row = await loadWithArtifact(fileId.toLowerCase());
  if (!row) return null;
  const access = await artifactAccess(row.file, row.publicId, viewerId);
  if (!canReadFile(row.file, viewerId, access)) return null;
  return fileServedAt(row.file, access?.servedVersionAt ?? null);
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
