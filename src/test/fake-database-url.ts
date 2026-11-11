/**
 * Fake Postgres connection strings for tests. Secret scanners flag any
 * `scheme://user:password@host` literal in the source, fake or not, so tests
 * build their URLs here from parts at run time instead of writing them out.
 * Neon-shaped hosts are joined from parts for the same reason.
 */

interface FakeDatabaseUrlParts {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
  query?: string;
}

const SCHEME = "postgres";

/** The domain of Neon, where production and the shared database run. */
export const neonDomain = ["neon", "tech"].join(".");

/** A Neon-shaped host for `endpoint`, such as `ep-example-000000.us-east-2.aws.<neon domain>`. */
export function fakeNeonHost(endpoint: string): string {
  return [endpoint, "us-east-2", "aws", neonDomain].join(".");
}

function rejectReserved(name: string, value: string, reserved: RegExp): string {
  if (reserved.test(value)) throw new Error(`fakeDatabaseUrl: ${name} "${value}" holds a reserved URL character`);
  return value;
}

/**
 * A Postgres URL assembled from `parts`. Every part has an obviously fake
 * default, and the password is left out when `password` is an empty string.
 * The user, password, and database are percent-encoded, so they parse back
 * unchanged; a host or query with a reserved character throws instead of
 * building a URL that parses into different parts.
 */
export function fakeDatabaseUrl(parts: FakeDatabaseUrlParts = {}): string {
  const { user = "fake-user", password = "fake-password", host = "db.example.com", port, database = "fake_db", query } = parts;
  const encodedUser = encodeURIComponent(user);
  const credentials = password === "" ? encodedUser : [encodedUser, encodeURIComponent(password)].join(":");
  const safeHost = rejectReserved("host", host, /[@:/?#\s]/u);
  const authority = port === undefined ? safeHost : [safeHost, String(port)].join(":");
  const path = encodeURIComponent(database);
  const fullPath = query === undefined ? path : [path, rejectReserved("query", query, /[#\s]/u)].join("?");
  return [SCHEME, "://", credentials, "@", authority, "/", fullPath].join("");
}
