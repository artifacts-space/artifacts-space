import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, type TestArtifactKind } from "./local-db";

/**
 * Seeding for the restore checks: an artifact whose History holds an older
 * and a newer version, as two of its author's saves ten minutes apart. Local
 * throwaway database only, like local-db.ts.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** A version's title and body. */
export interface SeededText {
  title: string;
  content: string;
}

/**
 * Creates a private artifact showing `newer`, with History holding `older`
 * (its create, ten minutes ago) and `newer` (the author's later edit).
 * Returns its public id.
 */
export async function seedTwoVersions(input: { userId: string; kind: TestArtifactKind; older: SeededText; newer: SeededText }): Promise<string> {
  const { userId, kind, older, newer } = input;
  const publicId = await createTestArtifact({ userId, title: older.title, content: older.content, visibility: "private", theme: null, kind });
  await db().query(
    `insert into artifact_version (id, artifact_id, title, content, kind, created_by, save_kind, by_agent, created_at, saved_at)
     select $1, id, title, content, kind, user_id, 'create', false, now() - interval '10 minutes', now() - interval '10 minutes' from artifact where public_id = $2`,
    [randomUUID(), publicId],
  );
  await db().query(
    `with saved as (
       update artifact set title = $2, content = $3, updated_by = user_id,
         updated_at = date_trunc('milliseconds', now()), person_saved_at = date_trunc('milliseconds', now())
       where public_id = $1
       returning id, title, content, kind, user_id, updated_at
     )
     insert into artifact_version (id, artifact_id, title, content, kind, created_by, save_kind, by_agent, created_at, saved_at)
     select $4, id, title, content, kind, user_id, 'edit', false, updated_at, updated_at from saved`,
    [publicId, newer.title, newer.content, randomUUID()],
  );
  return publicId;
}

/** The stored title and content of an artifact. */
export async function storedArtifactText(publicId: string): Promise<SeededText> {
  const result = await db().query<SeededText>(`select title, content from artifact where public_id = $1`, [publicId]);
  const row = result.rows[0];
  if (!row) throw new Error("No such artifact.");
  return row;
}

/** Closes this file's connections. */
export async function closeRestoreDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
