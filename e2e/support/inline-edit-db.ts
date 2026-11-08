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

/** Saves fields of an artifact as someone else would: the row changes and its updatedAt moves on. */
export async function saveAsSomeoneElse(publicId: string, changes: { title?: string; content?: string }): Promise<void> {
  await db().query(
    `update artifact set title = coalesce($2, title), content = coalesce($3, content), updated_by = null, updated_at = now() where public_id = $1`,
    [publicId, changes.title ?? null, changes.content ?? null],
  );
}

/** Closes this file's connections. */
export async function closeInlineEditDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
