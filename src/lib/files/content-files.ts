import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactFile, artifactVersion } from "@/db/schema";

import { contentRefKinds, fileRefsInContent } from "./refs";

/**
 * Which attached files an artifact's content has ever named (ui Image and
 * File elements, Markdown media and file links). The answer is kept on the
 * file row (`artifact_file.named_in_content`) and never cleared, so pruning
 * the versions that named a file cannot make it readable again for readers
 * of an approved version that does not show it (served-images.ts).
 *
 * Both orders of a save set it: a version written after the file is
 * attached marks it here (markNamedInContent), and a file attached after a
 * version names it is marked as it is attached (namedByAnyVersion).
 */

/** Formats whose content can name files, as a SQL list. */
const refKindsSql = sql.join(contentRefKinds.map((kind) => sql`${kind}`), sql`, `);

/**
 * Marks the artifact's attached files that `content` names. Call it with
 * every version written (insert or merge). Files of other artifacts are
 * never touched.
 */
export async function markNamedInContent(artifactId: string, kind: string, content: string): Promise<void> {
  const refs = fileRefsInContent(kind, content);
  if (refs.length === 0) return;
  await getDb()
    .update(artifactFile)
    .set({ namedInContent: true })
    .where(and(eq(artifactFile.artifactId, artifactId), inArray(artifactFile.id, refs), eq(artifactFile.namedInContent, false)));
}

/**
 * For the `named_in_content` value of a file being attached to `artifactId`:
 * whether any of that artifact's versions already names it. The file row is
 * written out as "artifact_file"."id", never a bare `id`, which inside the
 * subquery would mean the version's id (the correlated-subquery tripwire in
 * AGENTS.md). Matched case-insensitively, so it errs on hiding.
 */
export function namedByAnyVersion(artifactId: string) {
  return sql<boolean>`exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and v.kind in (${refKindsSql}) and strpos(lower(v.content), "artifact_file"."id") > 0)`;
}

/** The artifact's attached files that some version's content has named. */
export async function filesNamedInContent(artifactId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), eq(artifactFile.namedInContent, true)));
  return new Set(rows.map((row) => row.id));
}
