import { and, eq, like, or } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactVersion, type ArtifactFileRecord } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { ArtifactAccess } from "@/lib/access";

import { filesNamedInContent } from "./content-files";
import { hiddenImageFiles, imageFileIdsOf } from "./icon-cleanup-rules";
import { fileRefsInContent } from "./refs";

/**
 * Old icon and cover images, and files the content once embedded, stay
 * attached while any version in the history shows them, so Restore can bring
 * them back. Readers outside the team, who get the approved version, must
 * still see only that version's images and media; this finds the ones to
 * hide from them.
 *
 * "Once embedded" is the file row's `named_in_content` flag
 * (content-files.ts), not a scan of the versions kept today: pruning drops
 * old versions, and a file removed from the document must stay hidden after
 * the versions that showed it are gone.
 */

type ServedViewer = Pick<ArtifactAccess, "record" | "version" | "served">;

/** Every uploaded image the artifact's versions or latest save show as an icon or cover. */
async function imagesEverShown(viewable: Pick<ArtifactAccess, "record">): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, viewable.record.id), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
  return new Set([...rows, viewable.record].flatMap(imageFileIdsOf));
}

/** Whether any version, or the latest save, shows this one file as its icon or cover. */
async function shownAsImage(viewable: Pick<ArtifactAccess, "record">, fileId: string): Promise<boolean> {
  if (imageFileIdsOf(viewable.record).includes(fileId)) return true;
  const ref = `${FILE_PREFIX}${fileId}`;
  const [row] = await getDb()
    .select({ id: artifactVersion.id })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, viewable.record.id), or(eq(artifactVersion.icon, ref), like(artifactVersion.icon, `${ref}@%`), eq(artifactVersion.cover, ref), like(artifactVersion.cover, `${ref}@%`))))
    .limit(1);
  return row !== undefined;
}

/** The file references in the approved version's content (ui and Markdown). */
async function approvedContentRefs(versionId: string): Promise<string[]> {
  const [row] = await getDb().select({ kind: artifactVersion.kind, content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.id, versionId)).limit(1);
  return row ? fileRefsInContent(row.kind, row.content) : [];
}

/** The approved version's id when this viewer reads it and could have hidden files; otherwise null. */
function approvedVersionToCheck(viewable: ServedViewer): string | null {
  const { versionId } = viewable.version;
  if (viewable.version.source !== "approved" || versionId === null) return null;
  return viewable.record.kind === "file" ? null : versionId;
}

/** Of `shown`, the files the approved version shows neither as its icon or cover nor from its content. */
async function notServed(viewable: ServedViewer, versionId: string, shown: ReadonlySet<string>): Promise<Set<string>> {
  const served = new Set(imageFileIdsOf(viewable.served));
  if ([...shown].every((fileId) => served.has(fileId))) return new Set();
  const contentRefs = await approvedContentRefs(versionId);
  return hiddenImageFiles(shown, { icon: viewable.served.icon, cover: viewable.served.cover, kind: viewable.record.kind, contentRefs });
}

/**
 * The kept files this viewer may not open: for a reader of the approved
 * version, images any version showed as an icon or cover, and files the
 * content ever named, that the approved version does not show. Empty for
 * everyone who reads the latest version (the author and the team), who may
 * read the whole history anyway. For the file list; one file's request
 * uses fileHiddenFor.
 */
export async function hiddenImagesFor(viewable: ServedViewer): Promise<ReadonlySet<string>> {
  const versionId = approvedVersionToCheck(viewable);
  if (versionId === null) return new Set();
  const [images, contentFiles] = await Promise.all([imagesEverShown(viewable), filesNamedInContent(viewable.record.id)]);
  return notServed(viewable, versionId, new Set([...images, ...contentFiles]));
}

/**
 * Whether this viewer may not open one file of the artifact, by the same
 * rule as hiddenImagesFor, at the cost of one small query or two: the file
 * row already says whether content named it, so no version is scanned.
 */
export async function fileHiddenFor(viewable: ServedViewer, file: Pick<ArtifactFileRecord, "id" | "namedInContent">): Promise<boolean> {
  const versionId = approvedVersionToCheck(viewable);
  if (versionId === null) return false;
  const kept = file.namedInContent || (await shownAsImage(viewable, file.id));
  if (!kept) return false;
  return (await notServed(viewable, versionId, new Set([file.id]))).has(file.id);
}
