/**
 * Fake Postgres connection strings for tests. Secret scanners flag any
 * `scheme://user:password@host` literal in the source, fake or not, so tests
 * build their URLs here from parts at run time instead of writing them out.
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

/**
 * A Postgres URL assembled from `parts`. Every part has an obviously fake
 * default, and the password is left out when `password` is an empty string.
 */
export function fakeDatabaseUrl(parts: FakeDatabaseUrlParts = {}): string {
  const { user = "fake-user", password = "fake-password", host = "db.example.com", port, database = "fake_db", query } = parts;
  const credentials = password === "" ? user : [user, password].join(":");
  const authority = port === undefined ? host : [host, String(port)].join(":");
  const path = query === undefined ? database : [database, query].join("?");
  return [SCHEME, "://", credentials, "@", authority, "/", path].join("");
}
