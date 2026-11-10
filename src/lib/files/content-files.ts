import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactFile, artifactVersion } from "@/db/schema";

import { contentRefKinds, fileRefsInContent } from "./refs";

/**
 * Which attached files an artifact's content has named (ui Image and File
 * elements, Markdown media and file links), and since when. The answer is
 * kept on the file row (`artifact_file.named_in_content_at`) and never
 * cleared, so pruning the versions that named a file cannot make it readable
 * again for readers of an approved version that does not show it
 * (served-images.ts). The time scopes it: for readers of an approved
 * version, only files named by then count as content, so a plain attachment
 * that a later draft embeds stays a plain attachment for them.
 *
 * Both orders of a save set it: a version written after the file is
 * attached marks it here (markNamedInContent), and a file attached after a
 * version names it is marked as it is attached (namedAtAttach).
 */

/** Formats whose content can name files, as a SQL list. */
const refKindsSql = sql.join(contentRefKinds.map((kind) => sql`${kind}`), sql`, `);

/**
 * Marks the artifact's attached files that `content` names. Call it before
 * every version write (insert or merge): the production driver (neon-http)
 * has no interactive transactions, and in this order a failure between the
 * two writes leaves a file marked that no version names yet, which only errs
 * on hiding. Files of other artifacts are never touched. `at` is the
 * version's own time when it is back-dated; otherwise now, which is never
 * later than the version written next.
 */
export async function markNamedInContent(artifactId: string, kind: string, content: string, at?: Date): Promise<void> {
  const refs = fileRefsInContent(kind, content);
  if (refs.length === 0) return;
  // Matched against the artifact's unmarked files, not sent as a list: Markdown may link thousands of ids.
  const unmarked = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), isNull(artifactFile.namedInContentAt)));
  const named = new Set(refs);
  const toMark = unmarked.map((row) => row.id).filter((fileId) => named.has(fileId));
  if (toMark.length === 0) return;
  await getDb()
    .update(artifactFile)
    .set({ namedInContentAt: at ?? sql`now()` })
    .where(and(eq(artifactFile.artifactId, artifactId), inArray(artifactFile.id, toMark), isNull(artifactFile.namedInContentAt)));
}

/**
 * For the `named_in_content_at` value of a file being attached to
 * `artifactId`: now when any of that artifact's versions already names it,
 * else null. The file row is written out as "artifact_file"."id", never a
 * bare `id`, which inside the subquery would mean the version's id (the
 * correlated-subquery tripwire in AGENTS.md). Matched case-insensitively,
 * so it errs on hiding.
 */
export function namedAtAttach(artifactId: string) {
  return sql<Date | null>`case when exists (select 1 from ${artifactVersion} v where v.artifact_id = ${artifactId} and v.kind in (${refKindsSql}) and strpos(lower(v.content), "artifact_file"."id") > 0) then now() end`;
}

/** Whether a file counts as content for readers of a version saved at `servedAt`: content named it at or before then. */
export function namedBy(file: { namedInContentAt: Date | null }, servedAt: Date): boolean {
  return file.namedInContentAt !== null && file.namedInContentAt <= servedAt;
}

/** The artifact's attached files that some version's content has named, by `servedAt` when given. */
export async function filesNamedInContent(artifactId: string, servedAt?: Date): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: artifactFile.id })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), servedAt ? lte(artifactFile.namedInContentAt, servedAt) : isNotNull(artifactFile.namedInContentAt)));
  return new Set(rows.map((row) => row.id));
}
