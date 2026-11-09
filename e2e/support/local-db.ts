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

/** Inserts an artifact (Markdown unless `kind` says otherwise) with an optional theme (a preset id or theme JSON) and cover and returns its public id. */
export async function createTestArtifact(input: { userId: string; title: string; content: string; visibility: "private" | "public"; theme: unknown; cover?: string | null; kind?: "markdown" | "ui" }): Promise<string> {
  const result = await db().query<{ public_id: string }>(
    `insert into artifact (id, user_id, title, content, kind, visibility, comments, share_id, theme, cover, updated_by)
     values ($1, $2, $3, $4, $9, $5, 'team', $6, $7::jsonb, $8, $2) returning public_id`,
    [randomUUID(), input.userId, input.title, input.content, input.visibility, randomUUID().replaceAll("-", ""), input.theme === null ? null : JSON.stringify(input.theme), input.cover ?? null, input.kind ?? "markdown"],
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

/**
 * Changes a member's role in a team. A team always keeps an owner (the
 * team_member_keeps_an_owner trigger), so demoting the only owner first adds
 * a stand-in owner, an @example.com user that deleteTestTeams removes.
 */
export async function setTeamRole(teamId: string, userId: string, role: "owner" | "admin" | "member"): Promise<void> {
  if (role !== "owner") await ensureAnotherOwner(teamId, userId);
  await db().query(`update team_member set role = $3 where team_id = $1 and user_id = $2`, [teamId, userId, role]);
}

async function ensureAnotherOwner(teamId: string, userId: string): Promise<void> {
  const others = await db().query(`select 1 from team_member where team_id = $1 and user_id <> $2 and role = 'owner'`, [teamId, userId]);
  if (others.rowCount) return;
  const standIn = randomUUID();
  await db().query(`insert into "user" (id, name, email, email_verified) values ($1, 'Stand-in owner', $2, true)`, [standIn, `team-standin-${standIn.slice(0, 8)}@example.com`]);
  await db().query(`insert into team_member (id, team_id, user_id, role) values ($1, $2, $3, 'owner')`, [randomUUID(), teamId, standIn]);
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

/** Inserts `count` old revisions of a preset, a day ago and a minute apart from minute `from` on, to test the history and its cap. */
export async function seedPresetRevisions(teamId: string, ref: string, theme: unknown, count: number, from = 1): Promise<void> {
  const slug = ref.replace(/^team:/, "");
  await db().query(
    `insert into team_theme_revision (id, team_id, kind, preset_id, name, theme, created_at)
     select gen_random_uuid()::text, $1, 'preset', p.id, p.name, $3::jsonb, now() - interval '1 day' + (n * interval '1 minute')
     from team_theme_preset p, generate_series($5::int, $5::int + $4::int - 1) as n where p.slug = $2`,
    [teamId, slug, JSON.stringify(theme), count, from],
  );
}

/** How many revisions a team preset has. */
export async function presetRevisionCount(ref: string): Promise<number> {
  const result = await db().query<{ n: string }>(`select count(*) as n from team_theme_revision r join team_theme_preset p on p.id = r.preset_id where p.slug = $1`, [ref.replace(/^team:/, "")]);
  return Number(result.rows[0]?.n ?? 0);
}

/** Moves an artifact into a team at a visibility (as approved sharing would). */
export async function shareTestArtifact(publicId: string, teamId: string, visibility: "team" | "public"): Promise<void> {
  await db().query(`update artifact set team_id = $2, visibility = $3 where public_id = $1`, [publicId, teamId, visibility]);
}

/** Files a pending sharing request for an artifact in a team, as a member asking to share it would. */
export async function requestTestSharing(publicId: string, teamId: string, requestedBy: string, visibility: "team" | "link" | "public"): Promise<void> {
  await db().query(
    `insert into sharing_request (id, artifact_id, team_id, requested_by, kind, visibility, status)
     select $1, id, $2, $3, 'sharing', $4, 'pending' from artifact where public_id = $5`,
    [randomUUID(), teamId, requestedBy, visibility, publicId],
  );
}

/** Opens an invitation to an @example.com address that expires in a week. Deleting the team removes it. */
export async function inviteTestPerson(teamId: string, inviterId: string, email: string): Promise<void> {
  await db().query(
    `insert into team_invitation (id, team_id, email, role, status, expires_at, inviter_id) values ($1, $2, $3, 'member', 'pending', now() + interval '7 days', $4)`,
    [randomUUID(), teamId, email, inviterId],
  );
}

/** How many versions an artifact has. */
export async function versionCount(publicId: string): Promise<number> {
  const result = await db().query<{ n: string }>(`select count(*) as n from artifact_version v join artifact a on a.id = v.artifact_id where a.public_id = $1`, [publicId]);
  return Number(result.rows[0]?.n ?? 0);
}

/** Deletes seeded teams (their members and presets cascade). */
export async function deleteTestTeams(teamIds: readonly string[]): Promise<void> {
  if (!localDatabaseEnabled() || teamIds.length === 0) return;
  const standIns = await db().query<{ id: string }>(
    `select u.id from "user" u join team_member m on m.user_id = u.id where m.team_id = any($1) and u.email like 'team-standin-%@example.com'`,
    [teamIds],
  );
  await db().query(`delete from team where id = any($1) and slug like 'theme-e2e-%'`, [teamIds]);
  await db().query(`delete from "user" where id = any($1) and email like 'team-standin-%@example.com'`, [standIns.rows.map((row) => row.id)]);
}

/** The dev user's id, with their username confirmed so workspace pages skip the first-run username step. */
export async function readyDevUser(): Promise<string> {
  const id = await devUserId();
  await db().query(`update "user" set username_confirmed = true where id = $1`, [id]);
  return id;
}

/** The email address of a test user. */
export async function testUserEmail(id: string): Promise<string> {
  const result = await db().query<{ email: string }>(`select email from "user" where id = $1`, [id]);
  const email = result.rows[0]?.email;
  if (!email) throw new Error("The test user does not exist.");
  return email;
}

/** Deletes the sign-in links Better Auth stored for these @example.com addresses. */
export async function deleteSignInLinks(emails: readonly string[]): Promise<void> {
  const testEmails = emails.filter((email) => email.endsWith("@example.com"));
  if (!localDatabaseEnabled() || testEmails.length === 0) return;
  await db().query(`delete from verification where value::jsonb ->> 'email' = any($1)`, [testEmails]);
}

/** Adds a user to a team at a built-in role. */
export async function addTestMember(teamId: string, userId: string, role: "owner" | "admin" | "member"): Promise<void> {
  await db().query(`insert into team_member (id, team_id, user_id, role) values ($1, $2, $3, $4)`, [randomUUID(), teamId, userId, role]);
}

/** Creates a custom role with `capabilities` in a team and gives it to a member, as the Members tab would. */
export async function giveTestCustomRole(teamId: string, userId: string, name: string, capabilities: readonly string[]): Promise<void> {
  const roleId = randomUUID();
  await db().query(`insert into team_role (id, team_id, key, name, built_in) values ($1, $2, $3, $4, false)`, [roleId, teamId, name.toLowerCase(), name]);
  await db().query(`insert into team_role_capability (role_id, capability) select $1, unnest($2::text[])`, [roleId, capabilities]);
  await db().query(`update team_member set role = 'member' where team_id = $1 and user_id = $2`, [teamId, userId]);
  await db().query(`insert into team_role_assignment (member_id, role_id) select id, $3 from team_member where team_id = $1 and user_id = $2`, [teamId, userId, roleId]);
}

/** The custom role a member holds in a team, or null. */
export async function customRoleOf(teamId: string, userId: string): Promise<string | null> {
  const result = await db().query<{ key: string }>(
    `select r.key from team_role_assignment a join team_member m on m.id = a.member_id join team_role r on r.id = a.role_id where m.team_id = $1 and m.user_id = $2`,
    [teamId, userId],
  );
  return result.rows[0]?.key ?? null;
}

/** Demotes a member to Member with no stand-in owner, as a raw request would. */
export async function demoteDirectly(teamId: string, userId: string): Promise<void> {
  await db().query(`update team_member set role = 'member' where team_id = $1 and user_id = $2`, [teamId, userId]);
}

/** Demotes every member of a team in one statement, as a bulk script would. */
export async function demoteEveryoneDirectly(teamId: string): Promise<void> {
  await db().query(`update team_member set role = 'member' where team_id = $1`, [teamId]);
}

/**
 * Two owners demote each other at the same moment, each in its own
 * transaction, the way two requests would race. Returns which demotions the
 * database accepted.
 */
export async function demoteOwnersAtOnce(teamId: string, firstUserId: string, secondUserId: string): Promise<{ first: boolean; second: boolean }> {
  const [first, second] = await Promise.all([db().connect(), db().connect()]);
  const demote = `update team_member set role = 'member' where team_id = $1 and user_id = $2`;
  try {
    await first.query("begin");
    await first.query(demote, [teamId, secondUserId]);
    await second.query("begin");
    const waiting = second.query(demote, [teamId, firstUserId]).then(() => true, () => false);
    await first.query("commit");
    const secondDone = await waiting;
    await second.query(secondDone ? "commit" : "rollback");
    return { first: true, second: secondDone };
  } finally {
    first.release();
    second.release();
  }
}

/** The audit actions written for a team, oldest first. */
export async function permissionAuditActions(teamId: string): Promise<string[]> {
  const result = await db().query<{ action: string }>(`select action from team_permission_audit where team_id = $1 order by created_at`, [teamId]);
  return result.rows.map((row) => row.action);
}
