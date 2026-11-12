import { Pool } from "pg";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Database helpers for the inline editing checks: what the history holds
 * after an editing session, and saves made by "someone else" (another person
 * or an agent) while the browser edits. Local throwaway database only, like
 * local-db.ts.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** The save kinds of an artifact's versions, oldest first. */
export async function versionKinds(publicId: string): Promise<string[]> {
  const result = await db().query<{ save_kind: string }>(
    `select v.save_kind from artifact_version v join artifact a on a.id = v.artifact_id where a.public_id = $1 order by v.created_at, v.id`,
    [publicId],
  );
  return result.rows.map((row) => row.save_kind);
}

/** The stored title and content of an artifact. */
export async function storedText(publicId: string): Promise<{ title: string; content: string }> {
  const result = await db().query<{ title: string; content: string }>(`select title, content from artifact where public_id = $1`, [publicId]);
  const row = result.rows[0];
  if (!row) throw new Error("No such artifact.");
  return row;
}

/** The stored sheet formatting of an artifact (null when plain), and how many versions it has. */
export async function storedSheetFormat(publicId: string): Promise<{ format: unknown; versions: number }> {
  const result = await db().query<{ sheet_format: unknown; versions: string }>(
    `select a.sheet_format, (select count(*) from artifact_version v where v.artifact_id = a.id) as versions from artifact a where a.public_id = $1`,
    [publicId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("No such artifact.");
  return { format: row.sheet_format, versions: Number(row.versions) };
}

/** Sets an artifact's sheet formatting directly, as an editor's earlier save would have. */
export async function setStoredSheetFormat(publicId: string, format: unknown): Promise<void> {
  await db().query(`update artifact set sheet_format = $2 where public_id = $1`, [publicId, JSON.stringify(format)]);
}

/** Saves fields of an artifact as another person would in the web app: the row changes, and its updatedAt and person save time move on. */
export async function saveAsSomeoneElse(publicId: string, changes: { title?: string; content?: string }): Promise<void> {
  await db().query(
    `update artifact set title = coalesce($2, title), content = coalesce($3, content), updated_by = null, updated_at = now(), person_saved_at = now() where public_id = $1`,
    [publicId, changes.title ?? null, changes.content ?? null],
  );
}

/**
 * Saves new content as the artifact's author through an agent (Claude Code),
 * as an MCP save would: the row and its updatedAt change, the person save
 * time stays, and the save files its own version with the harness.
 */
export async function saveAsAgent(publicId: string, content: string): Promise<void> {
  await db().query(
    `with saved as (
       update artifact set content = $2, harness = 'claude-code', updated_by = user_id,
         updated_at = date_trunc('milliseconds', greatest(now(), updated_at + interval '1 millisecond'))
       where public_id = $1
       returning id, title, icon, theme, cover, summary, content, kind, language, source, metadata, user_id, updated_at
     )
     insert into artifact_version (id, artifact_id, title, icon, theme, cover, summary, content, kind, language, source, metadata, harness, by_agent, created_by, save_kind, created_at, saved_at)
     select gen_random_uuid()::text, id, title, icon, theme, cover, summary, content, kind, language, source, metadata, 'claude-code', true, user_id, 'edit', updated_at, updated_at from saved`,
    [publicId, content],
  );
}

/** The content and harness of an artifact's versions, oldest first. */
export async function versionSources(publicId: string): Promise<{ content: string; harness: string | null }[]> {
  const result = await db().query<{ content: string; harness: string | null }>(
    `select v.content, v.harness from artifact_version v join artifact a on a.id = v.artifact_id where a.public_id = $1 order by v.created_at, v.id`,
    [publicId],
  );
  return result.rows;
}

/** Closes this file's connections. */
export async function closeInlineEditDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
