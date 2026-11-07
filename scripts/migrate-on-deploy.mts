/**
 * Applies pending Drizzle migrations at the start of a Vercel production build.
 *
 * Vercel promotes a deployment only after its build succeeds, so the schema is
 * ready before the new code serves traffic, and a failed migration stops the
 * deploy while the old deployment keeps serving. Every other build (previews,
 * CI, local `pnpm build`) skips: an unmerged migration must never reach the
 * shared database. Run with: node scripts/migrate-on-deploy.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { z } from "zod";

/** Same folder, schema, and table that `drizzle-kit migrate` uses. */
const MIGRATIONS_FOLDER = "./drizzle";
const MIGRATIONS_TABLE = '"drizzle"."__drizzle_migrations"';

/** Shared by every deploy of this app, so overlapping builds migrate one at a time. */
const ADVISORY_LOCK_KEY = "7302514221";

/** How long a build waits for another build's migrations before it fails. */
const LOCK_WAIT = "10min";

type Env = Readonly<Record<string, string | undefined>>;

export type DeployPlan =
  | { kind: "skip"; message: string }
  | { kind: "fail"; message: string }
  | { kind: "migrate"; databaseUrl: string };

/**
 * Decides what this build does with migrations. Only a Vercel production build
 * migrates, and it needs the direct (unpooled) connection.
 */
export function planMigration(env: Env): DeployPlan {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production") {
    return { kind: "skip", message: "Skipping migrations: not a production deploy." };
  }
  const databaseUrl = env.DATABASE_URL_UNPOOLED?.trim();
  if (!databaseUrl) {
    return {
      kind: "fail",
      message: "Migrations failed: DATABASE_URL_UNPOOLED is not set. Production deploys apply migrations over the direct (unpooled) connection.",
    };
  }
  return { kind: "migrate", databaseUrl };
}

const SECRET_ENV_NAME = /^(DATABASE_URL|POSTGRES_|PG)/;
const MIN_SECRET_LENGTH = 4;

function urlParts(value: string): string[] {
  try {
    const url = new URL(value);
    return [url.password, url.username, url.hostname].map((part) => decodeURIComponent(part));
  } catch {
    return [];
  }
}

/** Collects every database-related env value, and the parts of each URL, that output must never show. */
export function secretsFrom(env: Env): string[] {
  const secrets = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SECRET_ENV_NAME.test(name)) continue;
    for (const secret of [value, ...urlParts(value)]) {
      if (secret.length >= MIN_SECRET_LENGTH) secrets.add(secret);
    }
  }
  return [...secrets].sort((a, b) => b.length - a.length);
}

const CONNECTION_STRING = /postgres(?:ql)?:\/\/[^\s'"]+/gi;

/** Removes connection strings and the given secret values from text before it is logged. */
export function redact(text: string, secrets: readonly string[]): string {
  let safe = text.replace(CONNECTION_STRING, "[redacted connection string]");
  for (const secret of secrets) safe = safe.split(secret).join("[redacted]");
  return safe;
}

const journalSchema = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
});

export type JournalEntry = z.infer<typeof journalSchema>["entries"][number];

/**
 * Lists the tags the migrator will apply. It applies every journal entry newer
 * than the newest applied migration, which is how drizzle compares them too.
 */
export function pendingTags(entries: readonly JournalEntry[], lastAppliedAt: number | null): string[] {
  return entries.filter((entry) => lastAppliedAt === null || entry.when > lastAppliedAt).map((entry) => entry.tag);
}

function readJournal(): JournalEntry[] {
  const raw: unknown = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"));
  return journalSchema.parse(raw).entries;
}

async function lastAppliedAt(client: pg.Client): Promise<number | null> {
  const table = await client.query<{ name: string | null }>(`select to_regclass('${MIGRATIONS_TABLE}')::text as name`);
  if (!table.rows[0]?.name) return null;
  const latest = await client.query<{ created_at: string | null }>(`select created_at from ${MIGRATIONS_TABLE} order by created_at desc limit 1`);
  const createdAt = latest.rows[0]?.created_at;
  return createdAt == null ? null : Number(createdAt);
}

async function migrateUnderLock(client: pg.Client): Promise<string[]> {
  await client.query(`set lock_timeout = '${LOCK_WAIT}'`);
  await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
  try {
    await client.query("reset lock_timeout");
    const pending = pendingTags(readJournal(), await lastAppliedAt(client));
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
    return pending;
  } finally {
    // Ending the session releases the lock too, so a failed unlock is not fatal.
    await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
  }
}

/** Connects, takes the advisory lock, applies pending migrations, and returns their tags. */
async function applyMigrations(databaseUrl: string, log: (message: string) => void): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30_000 });
  // pg emits connection errors as events; without a listener they crash the process unredacted.
  client.on("error", (error) => {
    log(`Database connection error: ${describeError(error)}`);
  });
  await client.connect();
  try {
    return await migrateUnderLock(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value : "Unknown error";
}

/** Formats an error and its causes in one line, without stack traces. */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current !== undefined && parts.length < 5) {
    parts.push(errorMessage(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" Caused by: ");
}

async function main(env: Env): Promise<number> {
  const plan = planMigration(env);
  if (plan.kind === "skip") {
    console.log(plan.message);
    return 0;
  }
  if (plan.kind === "fail") {
    console.error(plan.message);
    return 1;
  }
  const secrets = secretsFrom(env);
  const logError = (message: string) => {
    console.error(redact(message, secrets));
  };
  try {
    console.log("Applying database migrations before the production build.");
    const applied = await applyMigrations(plan.databaseUrl, logError);
    console.log(applied.length === 0 ? "Migrations: nothing to apply." : `Migrations applied: ${applied.join(", ")}.`);
    return 0;
  } catch (error) {
    logError(`Migrations failed: ${describeError(error)}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.env);
}
