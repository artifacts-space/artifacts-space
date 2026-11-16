/** Postgres SQLSTATE for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";
/** Postgres SQLSTATE for a table that does not exist. */
const UNDEFINED_TABLE = "42P01";
/** Postgres SQLSTATE for a statement ended to break a deadlock. */
const DEADLOCK_DETECTED = "40P01";

function codeOf(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  return value.code;
}

/** True when a database error, or a driver error wrapped in its `cause` a few levels down, carries this SQLSTATE. */
function hasSqlState(error: unknown, state: string, depth = 0): boolean {
  if (codeOf(error) === state) return true;
  if (depth >= 4 || typeof error !== "object" || error === null || !("cause" in error)) return false;
  return hasSqlState(error.cause, state, depth + 1);
}

/**
 * True when a database error (or the driver error Drizzle wraps in `cause`)
 * is a unique constraint violation.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION);
}

/**
 * True when a database error (or the driver error Drizzle wraps in `cause`)
 * says a table does not exist: the code is serving before its migration
 * was applied.
 */
export function isUndefinedTable(error: unknown): boolean {
  return hasSqlState(error, UNDEFINED_TABLE);
}

/** True when Postgres ended the statement to break a deadlock, so it is safe to run it once more. */
export function isDeadlock(error: unknown): boolean {
  return hasSqlState(error, DEADLOCK_DETECTED);
}
