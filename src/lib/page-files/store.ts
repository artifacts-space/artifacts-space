import { and, eq, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactFile, type ArtifactFileRecord } from "@/db/schema";
import { fileServedAt } from "@/lib/files/download";
import { UserFacingError } from "@/lib/user-facing-error";

import { pageFileLimits, pageFileTotalsProblem, type PageFileTotals } from "./rules";

/**
 * Page file rows: attaching uploads as page files, and finding the one a
 * page asked for. Callers check who may do what; the statements here hold
 * the rules that must not depend on an earlier read (an html artifact, the
 * limits, one file per path).
 */

/** SQL list of ids, for `in (…)`. */
function idList(ids: readonly string[]): SQL {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

/** How many page files an artifact holds, and their total size. */
export async function pageFileTotals(artifactId: string): Promise<PageFileTotals> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${artifactFile.size}), 0)::int` })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
  return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
}

/** The page files of an artifact: each one's id and path. */
export async function pageFilePaths(artifactId: string): Promise<{ id: string; pagePath: string }[]> {
  const rows = await getDb()
    .select({ id: artifactFile.id, pagePath: artifactFile.pagePath })
    .from(artifactFile)
    .where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
  return rows.flatMap((row) => (row.pagePath === null ? [] : [{ id: row.id, pagePath: row.pagePath }]));
}

/** Postgres's code for a unique index refusing a row: here, a second page file at one path. */
const uniqueViolation = "23505";

function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) => (typeof value === "object" && value !== null && "code" in value ? value.code : null);
  return code(error) === uniqueViolation || (error instanceof Error && code(error.cause) === uniqueViolation);
}

/**
 * Attaches the editor's own finished uploads that were requested as page
 * files to an HTML artifact, all or none, in one statement. The statement
 * itself holds what must be true: the uploads are theirs, ready, in no
 * artifact, and have a page path; the artifact is `html`; and with them the
 * artifact stays within the page file limits. Two files at one path are
 * refused by the unique index. Returns the ids attached (none when a rule
 * did not hold).
 */
export async function attachPageFileRows(editorId: string, artifactId: string, fileIds: readonly string[]): Promise<string[]> {
  if (fileIds.length === 0) return [];
  const mine = sql`u.id in (${idList(fileIds)}) and u.uploader_id = ${editorId} and u.status = 'ready' and u.artifact_id is null and u.page_path is not null`;
  const held = sql`from ${artifactFile} p where p.artifact_id = ${artifactId} and p.page_path is not null`;
  try {
    const result = await getDb().execute<{ id: string }>(sql`
      update ${artifactFile} f set artifact_id = ${artifactId}, attached_at = now(), attached_by_content = false
      where f.id in (select u.id from ${artifactFile} u where ${mine})
        and exists (select 1 from ${artifact} a where a.id = ${artifactId} and a.kind = 'html')
        and (select count(*) ${held}) + (select count(*) from ${artifactFile} u where ${mine}) <= ${pageFileLimits.maxFiles}
        and (select coalesce(sum(p.size), 0) ${held}) + (select coalesce(sum(u.size), 0) from ${artifactFile} u where ${mine}) <= ${pageFileLimits.maxTotalBytes}
      returning f.id
    `);
    return result.rows.map((row) => row.id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserFacingError("Two page files cannot have the same path, or paths that differ only by upper and lower case. Replace the file that is there (files_replace), or delete it first.");
    throw error;
  }
}

/**
 * Takes page files back out of an artifact, as uploads in none: the undo of
 * an attach that, with another attach at the same moment, left the artifact
 * over a limit (each statement checked the limits before the other landed).
 */
export async function detachPageFileRows(artifactId: string, fileIds: readonly string[]): Promise<void> {
  if (fileIds.length === 0) return;
  await getDb().update(artifactFile).set({ artifactId: null, attachedAt: null }).where(and(inArray(artifactFile.id, [...fileIds]), eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
}

/**
 * Attaches page files and checks the limits again once they are in: two
 * attaches at one moment each pass the statement's own check, so the one
 * that finds the artifact over a limit afterwards takes its files back out
 * and is refused. The artifact never stays over a limit.
 */
export async function attachPageFilesWithinLimits(editorId: string, artifactId: string, fileIds: readonly string[]): Promise<string[]> {
  const attached = await attachPageFileRows(editorId, artifactId, fileIds);
  if (attached.length === 0) return attached;
  const problem = pageFileTotalsProblem(await pageFileTotals(artifactId));
  if (!problem) return attached;
  await detachPageFileRows(artifactId, attached);
  throw new UserFacingError(problem);
}

/**
 * The page file at `path` of an HTML artifact, as the reader the address
 * was made for gets it, or null. `asOf` is set for a reader of an approved
 * version and for a version in History: then only a file attached by that
 * time counts, and a file replaced since is the copy that was current then
 * (fileServedAt), never a newer one. The path is matched exactly, letter case included, as a
 * static web host matches it: a link written `Css/Site.css` does not find
 * `css/site.css`, here or anywhere the page is hosted later. (Two files
 * whose paths differ only by case are refused on attach so a page never
 * depends on which of the two a host picks; that rule does not make the
 * lookup loose.) The guide and the upload tool tell agents so.
 */
export async function findPageFile(artifactId: string, path: string, asOf: Date | null): Promise<ArtifactFileRecord | null> {
  const [row] = await getDb()
    .select({ file: artifactFile })
    .from(artifactFile)
    .innerJoin(artifact, eq(artifact.id, artifactFile.artifactId))
    .where(and(eq(artifactFile.artifactId, artifactId), eq(artifactFile.pagePath, path), eq(artifactFile.status, "ready"), eq(artifact.kind, "html"), asOf ? lte(artifactFile.attachedAt, asOf) : undefined))
    .limit(1);
  return row ? fileServedAt(row.file, asOf) : null;
}
