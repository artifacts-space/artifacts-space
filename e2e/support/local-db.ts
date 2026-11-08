import { randomUUID } from "node:crypto";

import { Pool } from "pg";

/**
 * Seeding for the e2e checks that need artifacts in a database. They run
 * only with E2E_LOCAL_DB=1 and a DATABASE_URL on localhost (a throwaway
 * Postgres with every migration applied), so they can never write to a
 * shared or production database. Without that, the specs skip.
 */

/** True when the database-backed specs may run. */
export function localDatabaseEnabled(): boolean {
  const url = process.env.DATABASE_URL;
  if (process.env.E2E_LOCAL_DB !== "1" || !url) return false;
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export const localDatabaseSkipReason = "Set E2E_LOCAL_DB=1 and DATABASE_URL to a local throwaway Postgres with every migration applied.";

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** A user for seeded artifacts, with an @example.com email. Returns its id. */
export async function createTestUser(): Promise<string> {
  const id = randomUUID();
  await db().query(`insert into "user" (id, name, email, email_verified) values ($1, 'Theme e2e', $2, true)`, [id, `theme-e2e-${id.slice(0, 8)}@example.com`]);
  return id;
}

/** The id of the stub dev user, once dev sign-in has created it. */
export async function devUserId(): Promise<string> {
  const result = await db().query<{ id: string }>(`select id from "user" where email = 'dev@artifacts.space'`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Sign in as the dev user first.");
  return id;
}

/** Inserts an artifact with an optional theme and cover and returns its public id. */
export async function createTestArtifact(input: { userId: string; title: string; content: string; visibility: "private" | "public"; theme: string | null; cover?: string | null }): Promise<string> {
  const result = await db().query<{ public_id: string }>(
    `insert into artifact (id, user_id, title, content, kind, visibility, comments, share_id, theme, cover, updated_by)
     values ($1, $2, $3, $4, 'markdown', $5, 'team', $6, $7::jsonb, $8, $2) returning public_id`,
    [randomUUID(), input.userId, input.title, input.content, input.visibility, randomUUID().replaceAll("-", ""), input.theme === null ? null : JSON.stringify(input.theme), input.cover ?? null],
  );
  const publicId = result.rows[0]?.public_id;
  if (!publicId) throw new Error("The test artifact was not created.");
  return publicId;
}

/** Files an approved version with this cover (the one readers outside the team see), while the artifact row keeps its own. */
export async function approveVersionWithCover(publicId: string, cover: string | null): Promise<void> {
  const versionId = randomUUID();
  await db().query(
    `insert into artifact_version (id, artifact_id, title, cover, content, kind, created_by)
     select $1, id, title, $2, content, kind, user_id from artifact where public_id = $3`,
    [versionId, cover, publicId],
  );
  await db().query(`update artifact set approved_version_id = $1 where public_id = $2`, [versionId, publicId]);
}

/** Records a finished JPEG already attached to the artifact (no bytes in storage) and returns its id, for cover checks. */
export async function attachTestImage(publicId: string, userId: string, id: string = randomUUID()): Promise<string> {
  await db().query(
    `insert into artifact_file (id, uploader_id, artifact_id, key, filename, content_type, size, status, attached_at)
     select $1, $2, id, $3, 'cover.jpg', 'image/jpeg', 2048, 'ready', now() from artifact where public_id = $4`,
    [id, userId, `files/${id}/cover.jpg`, publicId],
  );
  return id;
}

/** The stored cover of an artifact, and the covers of its versions, newest first. */
export async function storedCovers(publicId: string): Promise<{ artifact: string | null; versions: (string | null)[] }> {
  const artifact = await db().query<{ id: string; cover: string | null }>(`select id, cover from artifact where public_id = $1`, [publicId]);
  const row = artifact.rows[0];
  if (!row) throw new Error("No such artifact.");
  const versions = await db().query<{ cover: string | null }>(`select cover from artifact_version where artifact_id = $1 order by created_at desc`, [row.id]);
  return { artifact: row.cover, versions: versions.rows.map((version) => version.cover) };
}

/** The stored theme of an artifact, and the themes of its versions, newest first. */
export async function storedThemes(publicId: string): Promise<{ artifact: unknown; versions: unknown[] }> {
  const artifact = await db().query<{ id: string; theme: unknown }>(`select id, theme from artifact where public_id = $1`, [publicId]);
  const row = artifact.rows[0];
  if (!row) throw new Error("No such artifact.");
  const versions = await db().query<{ theme: unknown }>(`select theme from artifact_version where artifact_id = $1 order by created_at desc`, [row.id]);
  return { artifact: row.theme, versions: versions.rows.map((version) => version.theme) };
}

/** Deletes seeded artifacts (their versions cascade) and test users. */
export async function cleanUp(publicIds: readonly string[], userIds: readonly string[]): Promise<void> {
  if (!localDatabaseEnabled()) return;
  if (publicIds.length > 0) await db().query(`delete from artifact where public_id = any($1)`, [publicIds]);
  if (userIds.length > 0) await db().query(`delete from "user" where id = any($1) and email like '%@example.com'`, [userIds]);
  await pool?.end();
  pool = null;
}

/** Whether a file row still exists. */
export async function fileRowExists(id: string): Promise<boolean> {
  const result = await db().query(`select 1 from artifact_file where id = $1`, [id]);
  return result.rowCount === 1;
}

/** Files the artifact's current state as a fresh edit by its author, as if they had just saved it (a quick next save would merge into it). */
export async function fileCurrentAsRecentEdit(publicId: string): Promise<void> {
  await db().query(
    `insert into artifact_version (id, artifact_id, title, icon, cover, content, kind, created_by, save_kind)
     select $1, id, title, icon, cover, content, kind, user_id, 'edit' from artifact where public_id = $2`,
    [randomUUID(), publicId],
  );
}
