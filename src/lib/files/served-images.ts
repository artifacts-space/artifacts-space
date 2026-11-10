import { and, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactFile, artifactVersion } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { ArtifactAccess } from "@/lib/access";

import { hiddenImageFiles, imageFileIdsOf } from "./icon-cleanup-rules";
import { contentRefKinds, fileRefsInContent } from "./refs";

/**
 * Old icon and cover images, and files the content once embedded, stay
 * attached while any version in the history shows them, so Restore can bring
 * them back. Readers outside the team, who get the approved version, must
 * still see only that version's images and media; this finds the ones to
 * hide from them.
 */

/** Every uploaded image the artifact's versions or latest save show as an icon or cover. */
async function imagesEverShown(viewable: Pick<ArtifactAccess, "record">): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, viewable.record.id), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
  return new Set([...rows, viewable.record].flatMap(imageFileIdsOf));
}

/** Formats whose content can name files, as a SQL list. */
const refKindsSql = sql.join(contentRefKinds.map((kind) => sql`${kind}`), sql`, `);

/**
 * The query for contentFilesEverNamed. Written with explicit aliases, so
 * every column is qualified (see the correlated-subquery tripwire in
 * AGENTS.md). A plain text match on the file id, so it errs on hiding.
 * Versions are enough: every save files or updates one (versions/history.ts),
 * so the latest save is always among them.
 */
export function contentFilesQuery(artifactId: string) {
  return sql`
    select f.id from ${artifactFile} f
    where f.artifact_id = ${artifactId}
      and exists (select 1 from ${artifactVersion} v where v.artifact_id = f.artifact_id and v.kind in (${refKindsSql}) and strpos(v.content, f.id) > 0)
  `;
}

/** The artifact's files that any version names in its content (ui or Markdown). */
async function contentFilesEverNamed(artifactId: string): Promise<Set<string>> {
  const result = await getDb().execute<{ id: string }>(contentFilesQuery(artifactId));
  return new Set(result.rows.map((row) => row.id));
}

/** The file references in the approved version's content (ui and Markdown). */
async function approvedContentRefs(versionId: string): Promise<string[]> {
  const [row] = await getDb().select({ kind: artifactVersion.kind, content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.id, versionId)).limit(1);
  return row ? fileRefsInContent(row.kind, row.content) : [];
}

/**
 * The kept files this viewer may not open: for a reader of the approved
 * version, images other versions showed as an icon or cover, and files
 * other versions' content named, that the approved version does not show.
 * Empty for everyone who reads the latest version (the author and the
 * team), who may read the whole history anyway.
 */
export async function hiddenImagesFor(viewable: Pick<ArtifactAccess, "record" | "version" | "served">): Promise<ReadonlySet<string>> {
  const { versionId } = viewable.version;
  if (viewable.version.source !== "approved" || versionId === null) return new Set();
  if (viewable.record.kind === "file") return new Set();
  const [images, contentFiles] = await Promise.all([imagesEverShown(viewable), contentFilesEverNamed(viewable.record.id)]);
  const shown = new Set([...images, ...contentFiles]);
  const served = new Set(imageFileIdsOf(viewable.served));
  if ([...shown].every((fileId) => served.has(fileId))) return new Set();
  const contentRefs = await approvedContentRefs(versionId);
  return hiddenImageFiles(shown, { icon: viewable.served.icon, cover: viewable.served.cover, kind: viewable.record.kind, contentRefs });
}
