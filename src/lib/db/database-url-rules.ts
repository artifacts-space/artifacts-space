/**
 * Which database local tools reach. `.env.local` names the shared database,
 * so a tool that reads it must never let it outrank what the person set for
 * this run, and the commands that change a schema refuse a database that is
 * not on this machine unless asked. drizzle.config.ts and playwright.config.ts
 * use these rules. Production deploys migrate through
 * scripts/migrate-on-deploy.mts, which uses neither.
 */

import ConnectionParameters from "pg/lib/connection-parameters";

type Env = Readonly<Record<string, string | undefined>>;

/** The variable that lets `drizzle-kit migrate` or `push` change a database that is not on this machine. */
export const ALLOW_SHARED_MIGRATE = "ALLOW_SHARED_MIGRATE";

/** drizzle-kit commands that change a database's schema. */
const schemaChangingCommands: ReadonlySet<string> = new Set(["migrate", "push"]);

/** Every drizzle-kit command, to find the one being run in its arguments. */
const drizzleKitCommands: ReadonlySet<string> = new Set(["generate", "migrate", "push", "pull", "introspect", "studio", "check", "up", "drop", "export"]);

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const localHosts: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

/** The host `pg` connects to for this URL: a `?host=` parameter wins over the URL's own host, and a URL without one falls back to PGHOST or localhost. */
function pgHost(url: string): string | undefined {
  return new ConnectionParameters(url).host;
}

/**
 * True when `url` is a Postgres URL on this machine (localhost or
 * 127.0.0.1). Decided from the host as `pg` reads it (pg-connection-string,
 * through pg's own ConnectionParameters), not only from the URL's host:
 * `postgres://u:p@localhost/db?host=db.example.net` connects to
 * db.example.net. A socket path, a list of hosts, any `hostaddr` that is
 * not local, and a malformed URL all count as not local.
 */
export function isLocalDatabaseUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!localHosts.has(parsed.hostname)) return false;
    const hostaddrs = parsed.searchParams.getAll("hostaddr");
    if (hostaddrs.some((address) => !localHosts.has(address))) return false;
    return localHosts.has(pgHost(url) ?? "");
  } catch {
    return false;
  }
}

/**
 * The URL drizzle-kit connects with: the direct (unpooled) connection. What
 * the process environment sets wins over `.env.local` (`file`); when only
 * DATABASE_URL is set there, it serves for both, so `.env.local`'s shared
 * DATABASE_URL_UNPOOLED never slips in under it. Blank values count as unset.
 */
export function drizzleDatabaseUrl(processEnv: Env, file: Env): string {
  return (
    present(processEnv.DATABASE_URL_UNPOOLED) ??
    present(processEnv.DATABASE_URL) ??
    present(file.DATABASE_URL_UNPOOLED) ??
    present(file.DATABASE_URL) ??
    ""
  );
}

/** The drizzle-kit command in these process arguments, or null (when the config is loaded some other way). */
export function drizzleKitCommand(argv: readonly string[]): string | null {
  return argv.find((argument) => drizzleKitCommands.has(argument)) ?? null;
}

/**
 * Why this run must stop before it connects, or null when it may go on. A
 * command that changes the schema may reach only a database on this machine,
 * unless ALLOW_SHARED_MIGRATE=1 is set for the run. The message never shows
 * the URL, which holds a password.
 */
export function sharedMigrateRefusal(input: { command: string | null; url: string; env: Env }): string | null {
  if (input.command === null || !schemaChangingCommands.has(input.command)) return null;
  if (!input.url) return `drizzle-kit ${input.command} stopped: no database URL is set. Copy .env.example to .env.local and fill in DATABASE_URL, or set DATABASE_URL for this run.`;
  if (isLocalDatabaseUrl(input.url) || input.env[ALLOW_SHARED_MIGRATE] === "1") return null;
  return [
    `drizzle-kit ${input.command} stopped: the database is not on this machine (localhost or 127.0.0.1).`,
    "For a throwaway database, set DATABASE_URL (and DATABASE_URL_UNPOOLED, if you set it) to it for this run.",
    `To change a shared database on purpose, set ${ALLOW_SHARED_MIGRATE}=1. Production deploys migrate on their own (scripts/migrate-on-deploy.mts).`,
  ].join(" ");
}

/**
 * The database variables for the e2e dev server, which `next dev` would
 * otherwise fill from `.env.local` (the shared database). With E2E_LOCAL_DB=1
 * and a DATABASE_URL on this machine, both point at that throwaway database
 * for the database-backed specs; otherwise both are empty, which Next never
 * overwrites from `.env.local`, so the fixture pages reach no database at all.
 */
export function e2eDevServerDatabaseEnv(env: Env): { DATABASE_URL: string; DATABASE_URL_UNPOOLED: string } {
  const local = env.E2E_LOCAL_DB === "1" && isLocalDatabaseUrl(env.DATABASE_URL) ? env.DATABASE_URL : "";
  return { DATABASE_URL: local, DATABASE_URL_UNPOOLED: local };
}
