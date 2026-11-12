/**
 * Creates one reviewer account for a connector directory, which tests the
 * product with a login and a password (no MFA, no emailed codes). Run by the
 * owner only; nothing on the web can create a password or change one
 * (src/lib/auth/password-sign-in-rules.ts).
 *
 *   DATABASE_URL=<database> node scripts/create-reviewer-account.mts \
 *     --email <name>@artifacts.space --name "<Display name>" --username <username>
 *
 * It writes, in one transaction: a user with a confirmed email and a chosen
 * username, the personal team the app gives every user, a password login
 * (Better Auth's "credential" account, hashed with Better Auth's own hasher),
 * and a few private sample artifacts. The password login is what marks a
 * reviewer account: find them with
 * `select user_id from account where provider_id = 'credential'`.
 *
 * With --reset-password it gives an existing reviewer account (one with a
 * password login) a new password and cuts every other way in: sessions, MCP
 * apps' OAuth tokens and approvals, its access tokens and its agents', and
 * unused sign-in links. It never adds
 * a password to an account that has none.
 *
 * The password is printed once, alone on stdout, and nowhere else. Every
 * other message goes to stderr. Only the database URL set for this run is
 * used, never `.env.local`; a database that is not on this machine also needs
 * ALLOW_SHARED_REVIEWER_ACCOUNT=1 for that one run.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";

import { isStrongEnough, PASSWORD_BYTES, parseReviewerArgs, reviewerDatabase, reviewerEmailProblem, sampleArtifacts, sampleVersionBytes, usage, type ReviewerRequest } from "./create-reviewer-account-rules.mts";
import { describeError, redact, secretsFrom } from "./migrate-on-deploy.mts";

type Env = Readonly<Record<string, string | undefined>>;

/** A user-facing stop: printed as is, with no stack. */
export class ReviewerAccountRefusal extends Error {}

function newPassword(): string {
  const password = randomBytes(PASSWORD_BYTES).toString("base64url");
  if (!isStrongEnough(password)) throw new Error("The generated password was too short.");
  return password;
}

async function existingUserId(client: pg.ClientBase, email: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(`select id from "user" where lower(email) = $1`, [email]);
  return result.rows[0]?.id ?? null;
}

async function assertHandleFree(client: pg.ClientBase, username: string) {
  const result = await client.query(`select 1 from "user" where username = $1 union all select 1 from team where slug = $1`, [username]);
  if (result.rowCount) throw new ReviewerAccountRefusal(`The username ${username} is taken. Pick another one.`);
}

async function insertSamples(client: pg.ClientBase, userId: string) {
  for (const sample of sampleArtifacts) {
    const artifactId = randomUUID();
    await client.query(
      `insert into artifact (id, user_id, title, summary, content, kind, visibility, comments, share_id, updated_by, person_saved_at)
       values ($1, $2, $3, $4, $5, $6, 'private', 'team', $7, $2, now())`,
      [artifactId, userId, sample.title, sample.summary, sample.content, sample.kind, randomUUID().replaceAll("-", "")],
    );
    await client.query(
      `insert into artifact_version (id, artifact_id, title, summary, content, kind, created_by, save_kind, by_agent, bytes)
       values ($1, $2, $3, $4, $5, $6, $7, 'create', false, $8)`,
      [randomUUID(), artifactId, sample.title, sample.summary, sample.content, sample.kind, userId, sampleVersionBytes(sample)],
    );
  }
}

async function createAccount(client: pg.ClientBase, request: ReviewerRequest, passwordHash: string) {
  if (await existingUserId(client, request.email)) {
    throw new ReviewerAccountRefusal("An account with this email already exists. The script never adds a password to an existing account; use --reset-password only for a reviewer account it created.");
  }
  await assertHandleFree(client, request.username);
  const userId = randomUUID();
  const teamId = randomUUID();
  await client.query(`insert into "user" (id, name, email, email_verified, username, username_confirmed) values ($1, $2, $3, true, $4, true)`, [userId, request.name, request.email, request.username]);
  await client.query(`insert into team (id, name, slug, personal, team_sharing_needs_approval, created_by) values ($1, $2, $3, true, false, $4)`, [teamId, request.name, request.username, userId]);
  await client.query(`insert into team_member (id, team_id, user_id, role) values ($1, $2, $3, 'owner')`, [randomUUID(), teamId, userId]);
  await client.query(`insert into account (id, account_id, provider_id, user_id, password) values ($1, $2, 'credential', $2, $3)`, [randomUUID(), userId, passwordHash]);
  await insertSamples(client, userId);
}

/**
 * Everything that lets someone act as the account without its password, in
 * the order the reset deletes it: web sessions, MCP apps' OAuth tokens and
 * approvals, the person's access tokens and those of the agents they added,
 * the connection records those leave behind, and sign-in links not yet used.
 */
const accessGrants = [
  [`delete from session where user_id = $1`, "user"],
  [`delete from oauth_access_token where user_id = $1`, "user"],
  [`delete from oauth_refresh_token where user_id = $1`, "user"],
  [`delete from oauth_consent where user_id = $1`, "user"],
  [`delete from api_token where user_id = $1 or user_id in (select user_id from agent where owner_id = $1)`, "user"],
  [`delete from mcp_connection where user_id = $1`, "user"],
  [`delete from verification where (case when left(value, 1) = '{' then value::jsonb ->> 'email' end) = $1`, "email"],
] as const;

async function resetPassword(client: pg.ClientBase, request: ReviewerRequest, passwordHash: string) {
  const userId = await existingUserId(client, request.email);
  const updated = userId
    ? await client.query(`update account set password = $3, updated_at = now() where user_id = $1 and provider_id = 'credential' and account_id = $2`, [userId, userId, passwordHash])
    : null;
  if (!userId || !updated?.rowCount) throw new ReviewerAccountRefusal("No reviewer account has this email. --reset-password changes only an account this script created.");
  // A new password cuts every other way in, in the same transaction.
  for (const [statement, subject] of accessGrants) await client.query(statement, [subject === "user" ? userId : request.email]);
}

/**
 * Creates the reviewer account, or with `resetPassword` replaces its password
 * and deletes every session, token, and approval, in one transaction. Throws
 * a ReviewerAccountRefusal (safe to print) when the request is refused.
 */
export async function writeAccount(databaseUrl: string, request: ReviewerRequest, passwordHash: string) {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30_000 });
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("begin");
    await (request.resetPassword ? resetPassword(client, request, passwordHash) : createAccount(client, request, passwordHash));
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(argv: readonly string[], env: Env): Promise<number> {
  const args = parseReviewerArgs(argv);
  if (!args.ok) {
    console.error(`${args.error}\n\n${usage}`);
    return 2;
  }
  const database = reviewerDatabase(env);
  if (!database.ok) {
    console.error(database.error);
    return 2;
  }
  const { request } = args;
  const emailProblem = reviewerEmailProblem(request.email, database);
  if (emailProblem) {
    console.error(`${emailProblem}\n\n${usage}`);
    return 2;
  }
  try {
    const password = newPassword();
    await writeAccount(database.url, request, await hashPassword(password));
    const done = request.resetPassword ? `Reset the password of ${request.email}; its sessions, app tokens, access tokens, and approvals are revoked.` : `Created reviewer account ${request.email} (username ${request.username}) with ${String(sampleArtifacts.length)} private sample artifacts.`;
    console.error(`${done} The password follows on stdout. It is shown only this once and is not saved anywhere.`);
    console.log(password);
    return 0;
  } catch (error) {
    console.error(error instanceof ReviewerAccountRefusal ? error.message : `Failed: ${redact(describeError(error), secretsFrom(env))}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
