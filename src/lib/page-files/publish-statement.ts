import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifactFileCopy } from "@/db/file-copy-schema";
import { artifact, artifactFile, artifactVersion, type ArtifactRecord } from "@/db/schema";
import { approvalCtes, roleGuard } from "@/lib/files/replace";
import type { HarnessStamp } from "@/lib/harness/harness-rules";
import type { SharingActor } from "@/lib/sharing/rules";
import type { VersionedChangeApproval } from "@/lib/versions/service";

import { pageFileLimits } from "./rules";

/*
 * The one statement that brings a page's files to a new state: files
 * added, files at paths the page already has replaced, files removed, the
 * version that records it, and its approval outcome. One statement, because
 * the production driver (neon-http) has no interactive transactions, and
 * one statement is all or nothing.
 */

/** One publish, planned: the artifact as the plan read it, and exactly which rows change. */
export interface PagePublishChange {
  /** The artifact as the plan read it. The statement runs only while it is still at that save, with that visibility and team. */
  before: ArtifactRecord;
  approval: VersionedChangeApproval;
  editorId: string;
  actor: SharingActor;
  harness: HarnessStamp | null;
  /** The id of the version the statement files. */
  versionId: string;
  /** The editor's finished uploads that become new page files. */
  addIds: readonly string[];
  /** Held page files, each with the editor's finished upload that takes its place at the same path. */
  replaces: readonly { entryId: string; uploadId: string }[];
  /** Held page files that go. */
  removeIds: readonly string[];
}

/** What a publish that landed did. */
export interface PublishedRows {
  savedAt: Date;
  /** The edit request the publish opened, when its change waits for approval. */
  openedRequestId: string | null;
  /** The storage keys of the removed files, to delete once the rows are gone. */
  removedKeys: string[];
}

/** SQL: `column` is one of `ids`; false for no ids (`in ()` is not SQL). */
function among(column: SQL, ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`false`;
  return sql`${column} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
}

/** SQL: an upload the editor may use as a page file: theirs, finished, in no artifact, and requested with a page path. */
function usable(alias: string, editorId: string): SQL {
  const row = sql.raw(alias);
  return sql`${row}.uploader_id = ${editorId} and ${row}.status = 'ready' and ${row}.artifact_id is null and ${row}.page_path is not null`;
}

/**
 * SQL that is 1 when every part of the publish found exactly the rows its
 * plan named and the page stays within its limits, and fails the whole
 * statement (a division by zero) otherwise, so a publish never lands in
 * part. A part finds fewer rows when an upload or a held file changed
 * after the plan read it. The limits are counted from the statement's own
 * view of the page's files: what it held, less what goes, plus what comes.
 */
function allOrNothing(change: PagePublishChange): SQL {
  const held = sql`from ${artifactFile} p where p.artifact_id = ${change.before.id} and p.page_path is not null`;
  const sum = (cte: string) => sql`(select coalesce(sum(size), 0) from ${sql.raw(cte)})`;
  const count = (cte: string) => sql`(select count(*) from ${sql.raw(cte)})`;
  const swaps = change.replaces.length;
  return sql`1 / (case when
      ${count("removed")} = ${change.removeIds.length}
      and ${count("taken")} = ${swaps} and ${count("copy")} = ${swaps} and ${count("swapped")} = ${swaps}
      and ${count("added")} = ${change.addIds.length}
      and (select count(*) ${held}) - ${change.removeIds.length} + ${change.addIds.length} <= ${pageFileLimits.maxFiles}
      and (select coalesce(sum(p.size), 0) ${held}) - ${sum("removed")} - ${sum("copy")} + ${sum("taken")} + ${sum("added")} <= ${pageFileLimits.maxTotalBytes}
    then 1 else 0 end)`;
}

const landedRow = z.object({ saved_at: z.union([z.string(), z.date()]), opened_request_id: z.string().nullable(), removed_keys: z.array(z.string()) });

/**
 * Runs the publish. It locks the artifact's row and runs only while the
 * artifact is still an HTML page at the save the plan read, with the
 * visibility and team its approval was decided for (and, when that
 * decision relied on the editor's role, while they still hold it). Under
 * that lock, in this order of meaning: the removed files' rows go; the
 * replacing uploads' rows go and each held file takes its upload's object,
 * after what it held became an old copy (as a single replace does,
 * src/lib/files/replace.ts); the new uploads attach, dated at the save, so
 * a reader of the version this files gets them; the version is filed from
 * the locked row; its approval outcome is written; and the artifact is
 * stamped. Every write joins the locked row, so with no such row nothing
 * runs and the answer is null. When a part finds fewer rows than planned,
 * or the page would be over a limit, the statement fails and nothing is
 * changed (allOrNothing): the caller reports that as a refusal.
 *
 * The save time is the database clock in whole milliseconds, a millisecond
 * or more after the artifact's last save (src/lib/edits/save-time.ts). Two
 * publishes cannot both land on one read of the page: the second waits for
 * the first's lock, then finds the save time moved on.
 */
export async function runPagePublish(change: PagePublishChange): Promise<PublishedRows | null> {
  const { before, approval, editorId, actor, harness, versionId } = change;
  const harnessId = harness?.harness ?? null;
  const entryIds = change.replaces.map((pair) => pair.entryId);
  const uploadIds = change.replaces.map((pair) => pair.uploadId);
  const personSaved = actor === "person" ? sql`version.saved_at` : sql`a.person_saved_at`;
  const approved = approval.outcome === "apply" ? sql`${versionId}` : sql`a.approved_version_id`;
  const opened = approval.outcome === "pending" ? sql`(select id from request where opened limit 1)` : sql`null::text`;
  const result = await getDb().execute(sql`
    with target as (
      select a.id, a.title, a.icon, a.theme, a.cover, a.summary, a.content, a.kind, a.language, a.project, a.source, a.metadata,
        date_trunc('milliseconds', greatest(now(), a.updated_at + interval '1 millisecond')) as at
      from ${artifact} a
      where a.id = ${before.id} and a.kind = 'html'
        and date_trunc('milliseconds', a.updated_at) = ${before.updatedAt.toISOString()}::timestamptz
        and a.visibility = ${before.visibility} and a.team_id is not distinct from ${before.teamId}${roleGuard({ approval, editorId })}
      for update
    ),
    removed as (
      delete from ${artifactFile} f using target t
      where f.artifact_id = t.id and f.page_path is not null and ${among(sql`f.id`, change.removeIds)}
      returning f.id, f.key, f.size
    ),
    taken as (
      delete from ${artifactFile} u using target t
      where ${among(sql`u.id`, uploadIds)} and ${usable("u", editorId)}
      returning u.key, u.content_type, u.size, u.uploader_id, u.page_path
    ),
    copy as (
      insert into ${artifactFileCopy} (id, file_id, artifact_id, key, filename, content_type, size, uploader_id, current_from, replaced_at, replaced_by, version_id)
      select gen_random_uuid()::text, e.id, e.artifact_id, e.key, e.filename, e.content_type, e.size, e.uploader_id, e.replaced_at, greatest(t.at, e.replaced_at), ${editorId}, ${versionId}
      from ${artifactFile} e
      join target t on t.id = e.artifact_id
      join taken on taken.page_path = e.page_path
      where ${among(sql`e.id`, entryIds)} and e.status = 'ready'
      returning size
    ),
    swapped as (
      update ${artifactFile} e
      set key = taken.key, content_type = taken.content_type, size = taken.size, uploader_id = taken.uploader_id, replaced_at = greatest(t.at, e.replaced_at)
      from taken, target t
      where e.artifact_id = t.id and e.page_path = taken.page_path and ${among(sql`e.id`, entryIds)} and e.status = 'ready'
      returning e.id
    ),
    added as (
      update ${artifactFile} f set artifact_id = t.id, attached_at = t.at, attached_by_content = false
      from target t
      where ${among(sql`f.id`, change.addIds)} and ${usable("f", editorId)}
      returning f.id, f.size
    ),
    version as (
      insert into ${artifactVersion} (id, artifact_id, title, icon, theme, cover, summary, content, kind, language, project, source, metadata, bytes, harness, by_agent, created_by, save_kind, created_at, saved_at)
      select ${versionId}, t.id, t.title, t.icon, t.theme, t.cover, t.summary, t.content, t.kind, t.language, t.project, t.source, t.metadata,
        octet_length(t.content) + octet_length(t.metadata::text), ${harnessId}, ${actor === "agent"}, ${editorId}, 'files', t.at, t.at
      from target t
      returning id, saved_at
    )${approvalCtes({ approval, artifactId: before.id, editorId })},
    stamped as (
      update ${artifact} a set updated_by = ${editorId}, updated_at = version.saved_at, person_saved_at = ${personSaved}, harness = coalesce(${harnessId}::text, a.harness), approved_version_id = ${approved}
      from version
      where a.id = ${before.id}
      returning a.updated_at
    )
    select stamped.updated_at as saved_at, ${opened} as opened_request_id,
      (select coalesce(json_agg(removed.key), '[]'::json) from removed) as removed_keys,
      ${allOrNothing(change)} as landed
    from stamped
  `);
  const [row] = result.rows;
  if (!row) return null;
  const landed = landedRow.parse(row);
  return { savedAt: new Date(landed.saved_at), openedRequestId: landed.opened_request_id, removedKeys: landed.removed_keys };
}

/** Postgres's codes for the two ways the statement refuses a publish as a whole. */
const divisionByZero = "22012";
const uniqueViolation = "23505";

function codeOf(error: unknown): unknown {
  const read = (value: unknown) => (typeof value === "object" && value !== null && "code" in value ? value.code : null);
  return read(error) ?? (error instanceof Error ? read(error.cause) : null);
}

/**
 * Whether an error is the statement refusing the publish as a whole: a part
 * found other rows than planned or the page would be over a limit
 * (allOrNothing), or two files would share a path (the unique index).
 * Nothing was changed.
 */
export function isPublishRefusal(error: unknown): boolean {
  const code = codeOf(error);
  return code === divisionByZero || code === uniqueViolation;
}
