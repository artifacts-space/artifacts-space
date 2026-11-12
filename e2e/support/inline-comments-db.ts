import { Pool } from "pg";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Database helpers for the inline comment checks: what a comment made in the
 * browser stored. Local throwaway database only, like local-db.ts.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** An artifact's comments as stored, oldest first: the body, the words it is on, and whether its thread is resolved. */
export async function storedComments(publicId: string): Promise<{ body: string; quote: string | null; reply: boolean; resolved: boolean }[]> {
  const result = await db().query<{ body: string; quote: string | null; reply: boolean; resolved: boolean }>(
    `select c.body, c.quote, c.parent_id is not null as reply, c.resolved_at is not null as resolved
       from comment c join artifact a on a.id = c.artifact_id where a.public_id = $1 order by c.created_at, c.id`,
    [publicId],
  );
  return result.rows;
}

/** Closes this file's connections. */
export async function closeInlineCommentsDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
