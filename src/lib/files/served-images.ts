import { and, eq, like, or } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactVersion } from "@/db/schema";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import type { ArtifactAccess } from "@/lib/access";

import { hiddenImageFiles, imageFileIdsOf } from "./icon-cleanup-rules";
import { fileRefsInContent } from "./refs";

/**
 * Old icon and cover images stay attached while any version in the history
 * shows them, so Restore can bring them back. Readers outside the team, who
 * get the approved version, must still see only that version's images; this
 * finds the ones to hide from them.
 */

/** Every uploaded image the artifact's versions or latest save show as an icon or cover. */
async function imagesEverShown(viewable: Pick<ArtifactAccess, "record">): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ icon: artifactVersion.icon, cover: artifactVersion.cover })
    .from(artifactVersion)
    .where(and(eq(artifactVersion.artifactId, viewable.record.id), or(like(artifactVersion.icon, `${FILE_PREFIX}%`), like(artifactVersion.cover, `${FILE_PREFIX}%`))));
  return new Set([...rows, viewable.record].flatMap(imageFileIdsOf));
}

/** The file references in the approved version's content; only ui content has any. */
async function approvedContentRefs(versionId: string, kind: string): Promise<string[]> {
  if (kind !== "ui") return [];
  const [row] = await getDb().select({ content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.id, versionId)).limit(1);
  return row ? fileRefsInContent(kind, row.content) : [];
}

/**
 * The icon and cover images this viewer may not open: for a reader of the
 * approved version, images other versions showed that the approved version
 * does not. Empty for everyone who reads the latest version (the author and
 * the team), who may read the whole history anyway.
 */
export async function hiddenImagesFor(viewable: Pick<ArtifactAccess, "record" | "version" | "served">): Promise<ReadonlySet<string>> {
  const { versionId } = viewable.version;
  if (viewable.version.source !== "approved" || versionId === null) return new Set();
  const shown = await imagesEverShown(viewable);
  const served = new Set(imageFileIdsOf(viewable.served));
  if ([...shown].every((fileId) => served.has(fileId))) return new Set();
  const contentRefs = await approvedContentRefs(versionId, viewable.record.kind);
  return hiddenImageFiles(shown, { icon: viewable.served.icon, cover: viewable.served.cover, kind: viewable.record.kind, contentRefs });
}
