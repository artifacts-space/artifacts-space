/**
 * Size limits for an artifact's stored cover. Kept apart from cover.ts so the
 * database schema (loaded by drizzle-kit without the "@/" alias) can import
 * them for its CHECK constraint.
 */
export const artifactCoverLimits = {
  /** Longest stored cover, in characters: the database backstop. "file:<uuid>@100" is 45. */
  maxStoredChars: 64,
  /** Longest cover input, before it is parsed. */
  maxInputLength: 80,
} as const;
