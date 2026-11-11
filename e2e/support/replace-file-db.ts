import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Seeding for the replaced-file History checks: a private file artifact
 * whose sow.pdf was replaced, with the version from before the replace and
 * the replace's own, as replace.ts leaves them. Local throwaway database
 * only, like local-db.ts. There is no file storage locally, so the bytes
 * are never needed.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** A seeded artifact with one replaced file. */
export interface ReplacedFileSeed {
  publicId: string;
  fileId: string;
  copyId: string;
}

/** Seeds a private file artifact whose sow.pdf was replaced ten minutes ago, owned by `userId`. */
export async function seedReplacedFile(userId: string, title: string): Promise<ReplacedFileSeed> {
  const artifactId = randomUUID();
  const fileId = randomUUID();
  const uploadId = randomUUID();
  const copyId = randomUUID();
  const replaceVersion = randomUUID();
  const created = await db().query<{ public_id: string }>(
    `insert into artifact (id, user_id, title, content, kind, visibility, comments, share_id, updated_by)
     values ($1, $2, $3, '', 'file', 'private', 'team', $4, $2) returning public_id`,
    [artifactId, userId, title, randomUUID().replaceAll("-", "")],
  );
  const publicId = created.rows[0]?.public_id;
  if (!publicId) throw new Error("The test artifact was not created.");
  await db().query(
    `insert into artifact_file (id, uploader_id, artifact_id, key, filename, content_type, size, status, attached_at, replaced_at)
     values ($1, $2, $3, $4, 'sow.pdf', 'application/pdf', 2048, 'ready', $5, $6)`,
    [fileId, userId, artifactId, `files/${uploadId}/sow-v2.pdf`, minutesAgo(30), minutesAgo(10)],
  );
  const version = `insert into artifact_version (id, artifact_id, title, content, kind, created_by, save_kind, created_at, saved_at) values ($1, $2, $3, '', 'file', $4, $5, $6, $6)`;
  await db().query(version, [randomUUID(), artifactId, title, userId, "files", minutesAgo(29)]);
  await db().query(version, [replaceVersion, artifactId, title, userId, "replace", minutesAgo(9)]);
  await db().query(
    `insert into artifact_file_copy (id, file_id, artifact_id, key, filename, content_type, size, uploader_id, current_from, replaced_at, replaced_by, version_id)
     values ($1, $2, $3, $4, 'sow.pdf', 'application/pdf', 1024, $5, null, $6, $5, $7)`,
    [copyId, fileId, artifactId, `files/${fileId}/sow.pdf`, userId, minutesAgo(10), replaceVersion],
  );
  return { publicId, fileId, copyId };
}

/** Deletes the seeded files and copies (the artifacts go with local-db's cleanUp), then closes the pool. */
export async function cleanUpReplacedFiles(seeds: readonly ReplacedFileSeed[]): Promise<void> {
  if (!localDatabaseEnabled()) return;
  const fileIds = seeds.map((seed) => seed.fileId);
  if (fileIds.length > 0) {
    await db().query(`delete from artifact_file_copy where file_id = any($1)`, [fileIds]);
    await db().query(`delete from artifact_file where id = any($1)`, [fileIds]);
  }
  await pool?.end();
  pool = null;
}
