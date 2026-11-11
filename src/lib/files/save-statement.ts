import { and, getTableColumns, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactRecord } from "@/db/schema";

/**
 * A save's statement: its guarded UPDATE of the artifact as a CTE, the
 * uploads it attaches, and any further writes from the saved row (its
 * version and approval, src/lib/versions/save-write.ts), all in one
 * statement, because the production driver (neon-http) has no interactive
 * transactions. It imports nothing that files a version, so the save path
 * can use it without an import cycle.
 */

/** The uploads a save will attach: the media its content names, and its icon and cover images. */
export interface SaveFiles {
  contentFileIds: string[];
  imageFileIds: string[];
}

/** SQL list of ids, for `in (…)`. */
function idList(ids: readonly string[]): SQL {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

/** A further data-modifying CTE of a save's statement, after `saved` (and `attached`), which it may read. */
export interface SaveCte {
  name: string;
  query: SQL;
}

/** What else a save's statement writes: its CTEs, in order, and one value the statement reports back (`note`). */
export interface SaveExtras {
  ctes: readonly SaveCte[];
  note: SQL<string | null>;
}

/**
 * Runs a save's guarded UPDATE of the artifact and attaches its uploads in
 * one statement: the UPDATE is a CTE, and the uploads attach only from the
 * row it returned, so they attach exactly when the save lands. One statement,
 * because the production driver (neon-http) has no interactive
 * transactions. Content media attach as content media, icon and cover images
 * as plain files (an id named both ways counts as content media). Returns the saved row,
 * or null when the UPDATE matched nothing.
 */
export async function writeAndAttach(update: SQL, editorId: string, files: SaveFiles): Promise<ArtifactRecord | null> {
  return (await writeAndAttachWith(update, editorId, files))?.record ?? null;
}

/**
 * writeAndAttach with `extras`: CTEs that run in the same statement from the
 * saved row (a save's version and its approval, src/lib/versions/save-write.ts),
 * and the value they report (`note`). They run only when the UPDATE matched.
 */
export async function writeAndAttachWith(update: SQL, editorId: string, files: SaveFiles, extras?: SaveExtras): Promise<{ record: ArtifactRecord; note: string | null } | null> {
  const ids = [...new Set([...files.contentFileIds, ...files.imageFileIds])];
  const db = getDb();
  const saved = db.$with("saved", getTableColumns(artifact)).as(update);
  const attach = ids.length > 0 ? [attachedCte(editorId, files, ids)] : [];
  const more = (extras?.ctes ?? []).map((cte) => db.$with(cte.name, { id: artifactFile.id }).as(cte.query));
  const attachedCount = ids.length > 0 ? sql<number>`(select count(*) from attached)::int` : sql<number>`0`;
  // Uploads the save named that were in no artifact when the statement began (its snapshot; files already in this artifact are expected).
  const looseCount = ids.length > 0 ? sql<number>`(select count(*) from ${artifactFile} l where l.id in (${idList(ids)}) and l.artifact_id is null)::int` : sql<number>`0`;
  const [row] = await db.with(saved, ...attach, ...more).select({ record: savedRow(saved), attachedCount, looseCount, note: extras?.note ?? sql<string | null>`null::text` }).from(saved);
  if (!row) return null;
  // Only when one of those was taken or deleted in between does the save look further: no extra query on the common path.
  if (row.attachedCount < row.looseCount) await reportUnattached(row.record.id, ids);
  return { record: row.record, note: row.note };
}

/** The CTE that attaches the save's uploads from the saved row (`saved`). */
function attachedCte(editorId: string, files: SaveFiles, ids: readonly string[]) {
  const byContent = files.contentFileIds.length > 0 ? sql`f.id in (${idList(files.contentFileIds)})` : sql`false`;
  return getDb().$with("attached", { id: artifactFile.id }).as(sql`
    update ${artifactFile} f set artifact_id = saved.id, attached_at = now(), attached_by_content = ${byContent}
    from saved
    where f.id in (${idList(ids)}) and f.uploader_id = ${editorId} and f.status = 'ready' and f.artifact_id is null
    returning f.id
  `);
}

/** Every column of the saved row, read from the CTE. */
function savedRow<T extends Record<keyof typeof artifactColumns, unknown>>(saved: T) {
  const fields = Object.keys(artifactColumns).map((key) => [key, saved[key as keyof typeof artifactColumns]]);
  return Object.fromEntries(fields) as Pick<T, keyof typeof artifactColumns>;
}

const artifactColumns = getTableColumns(artifact);

/**
 * Logs a save whose content or images name an upload still in no artifact
 * after the save: another request took or deleted it in between. Uploads
 * already in this artifact are expected and not counted.
 */
async function reportUnattached(artifactId: string, ids: readonly string[]) {
  const loose = await getDb().select({ id: artifactFile.id }).from(artifactFile).where(and(inArray(artifactFile.id, [...ids]), isNull(artifactFile.artifactId)));
  if (loose.length > 0) console.error("[files] A save named uploads it could not attach", { artifactId, count: loose.length });
}
