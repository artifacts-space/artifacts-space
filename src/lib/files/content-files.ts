import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactFile } from "@/db/schema";

/**
 * Which attached files are content media: files a content save attached,
 * because the Markdown or ui content being saved named the editor's own
 * upload (`artifact_file.attached_by_content`, set by attachFileRows). They
 * follow the media rules: hidden from readers of an approved version that
 * does not show them (served-images.ts), kept for Restore while a version
 * names them, and removed once none does (icon-cleanup.ts).
 *
 * Every other attachment (files_attach, the Files panel, and every file
 * attached before the column existed) stays a plain attachment, even when
 * content links it later: pruning never removes it, and readers of the
 * approved version see it as an attachment.
 */

/** The artifact's attached files that a content save attached. */
export async function filesAttachedByContent(artifactId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), eq(artifactFile.attachedByContent, true)));
  return new Set(rows.map((row) => row.id));
}
