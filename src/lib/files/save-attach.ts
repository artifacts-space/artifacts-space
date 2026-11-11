import { and, getTableColumns, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactRecord } from "@/db/schema";

import { checkContentFiles } from "./attach";
import { checkCoverFile } from "./cover-file";
import { checkIconFile } from "./icon-file";

/** The uploads a save will attach: the media its content names, and its icon and cover images. */
export interface SaveFiles {
  contentFileIds: string[];
  imageFileIds: string[];
}

/**
 * Checks the files an update's content, icon, and cover point at, and
 * returns them without attaching anything. The save attaches them in the
 * same statement as its guarded write (writeAndAttach), so a refused save
 * leaves every upload as it was and a landed one never names an upload it
 * did not attach.
 */
export async function checkUpdatedContentFiles(userId: string, current: Pick<ArtifactRecord, "id" | "kind" | "content">, update: { kind?: string | undefined; content?: string | undefined; icon?: string | null | undefined; cover?: string | null | undefined }): Promise<SaveFiles> {
  const imageFileIds = [...(await checkIconFile(userId, current.id, update.icon)), ...(await checkCoverFile(userId, current.id, update.cover))];
  const contentChanged = update.kind !== undefined || update.content !== undefined;
  const contentFileIds = contentChanged ? await checkContentFiles(userId, current.id, update.kind ?? current.kind, update.content ?? current.content) : [];
  return { contentFileIds, imageFileIds };
}

/** SQL list of ids, for `in (…)`. */
function idList(ids: readonly string[]): SQL {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
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
  const ids = [...new Set([...files.contentFileIds, ...files.imageFileIds])];
  const db = getDb();
  const saved = db.$with("saved", getTableColumns(artifact)).as(update);
  if (ids.length === 0) {
    const [row] = await db.with(saved).select().from(saved);
    return row ?? null;
  }
  const byContent = files.contentFileIds.length > 0 ? sql`f.id in (${idList(files.contentFileIds)})` : sql`false`;
  const attached = db.$with("attached", { id: artifactFile.id }).as(sql`
    update ${artifactFile} f set artifact_id = saved.id, attached_at = now(), attached_by_content = ${byContent}
    from saved
    where f.id in (${idList(ids)}) and f.uploader_id = ${editorId} and f.status = 'ready' and f.artifact_id is null
    returning f.id
  `);
  const [row] = await db.with(saved, attached).select({ record: savedRow(saved), attachedCount: sql<number>`(select count(*) from attached)::int` }).from(saved);
  if (!row) return null;
  if (row.attachedCount < ids.length) await reportUnattached(row.record.id, ids);
  return row.record;
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
