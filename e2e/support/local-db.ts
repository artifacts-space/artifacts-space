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

/** Inserts an artifact with an optional theme (a preset id or theme JSON) and cover and returns its public id. */
export async function createTestArtifact(input: { userId: string; title: string; content: string; visibility: "private" | "public"; theme: unknown; cover?: string | null }): Promise<string> {
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

/** A shared (not personal) team with one member at `role`. Returns its id and slug. */
export async function createTestTeam(userId: string, role: "owner" | "admin" | "member" = "owner"): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = `theme-e2e-${id.slice(0, 8)}`;
  await db().query(`insert into team (id, name, slug, personal, created_by) values ($1, $2, $3, false, $4)`, [id, `Theme team ${id.slice(0, 4)}`, slug, userId]);
  await db().query(`insert into team_member (id, team_id, user_id, role) values ($1, $2, $3, $4)`, [randomUUID(), id, userId, role]);
  return { id, slug };
}

/** Changes a member's role in a team. */
export async function setTeamRole(teamId: string, userId: string, role: "owner" | "admin" | "member"): Promise<void> {
  await db().query(`update team_member set role = $3 where team_id = $1 and user_id = $2`, [teamId, userId, role]);
}

/** Inserts a team preset with theme JSON and returns its id ("team:<slug>"). */
export async function createTestTeamPreset(teamId: string, name: string, theme: unknown): Promise<string> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  await db().query(`insert into team_theme_preset (id, team_id, slug, name, theme) values ($1, $2, $3, $4, $5::jsonb)`, [randomUUID(), teamId, slug, name, JSON.stringify(theme)]);
  return `team:${slug}`;
}

/** Sets a team's default theme. */
export async function setTestTeamDefault(teamId: string, theme: string | null): Promise<void> {
  await db().query(`update team set default_theme = $2 where id = $1`, [teamId, theme]);
}

/** A team's default theme and who set it. */
export async function teamDefaultOf(teamId: string): Promise<{ theme: string | null; setBy: string | null }> {
  const result = await db().query<{ default_theme: string | null; default_theme_set_by: string | null }>(`select default_theme, default_theme_set_by from team where id = $1`, [teamId]);
  const row = result.rows[0];
  return { theme: row?.default_theme ?? null, setBy: row?.default_theme_set_by ?? null };
}

/** The ids ("team:<slug>") of a team's presets with this name. */
export async function teamPresetRefs(teamId: string, name: string): Promise<string[]> {
  const result = await db().query<{ slug: string }>(`select slug from team_theme_preset where team_id = $1 and name = $2`, [teamId, name]);
  return result.rows.map((row) => `team:${row.slug}`);
}

/** The stored theme JSON of a team's preset with this name, or null. */
export async function teamPresetTheme(teamId: string, name: string): Promise<unknown> {
  const result = await db().query<{ theme: unknown }>(`select theme from team_theme_preset where team_id = $1 and name = $2`, [teamId, name]);
  return result.rows[0]?.theme ?? null;
}

/** Moves an artifact into a team at a visibility (as approved sharing would). */
export async function shareTestArtifact(publicId: string, teamId: string, visibility: "team" | "public"): Promise<void> {
  await db().query(`update artifact set team_id = $2, visibility = $3 where public_id = $1`, [publicId, teamId, visibility]);
}

/** How many versions an artifact has. */
export async function versionCount(publicId: string): Promise<number> {
  const result = await db().query<{ n: string }>(`select count(*) as n from artifact_version v join artifact a on a.id = v.artifact_id where a.public_id = $1`, [publicId]);
  return Number(result.rows[0]?.n ?? 0);
}

/** Deletes seeded teams (their members and presets cascade). */
export async function deleteTestTeams(teamIds: readonly string[]): Promise<void> {
  if (!localDatabaseEnabled() || teamIds.length === 0) return;
  await db().query(`delete from team where id = any($1) and slug like 'theme-e2e-%'`, [teamIds]);
}

/** The dev user's id, with their username confirmed so workspace pages skip the first-run username step. */
export async function readyDevUser(): Promise<string> {
  const id = await devUserId();
  await db().query(`update "user" set username_confirmed = true where id = $1`, [id]);
  return id;
}
