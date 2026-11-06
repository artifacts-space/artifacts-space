/** Postgres SQLSTATE for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

function codeOf(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  return value.code;
}

/**
 * True when a database error (or the driver error Drizzle wraps in `cause`)
 * is a unique constraint violation.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (codeOf(error) === UNIQUE_VIOLATION) return true;
  if (typeof error === "object" && error !== null && "cause" in error) return isUniqueViolation(error.cause);
  return false;
}
