/**
 * Size limits for an artifact's page icon. Kept apart from artifact-icons.ts
 * so the database schema (loaded by drizzle-kit without the "@/" alias) can
 * import them for its CHECK constraint.
 */
export const artifactIconLimits = {
  /** Longest stored icon, in characters: the database backstop. */
  maxStoredChars: 64,
  /** Longest icon input, in UTF-16 code units, before it is parsed. */
  maxInputLength: 64,
} as const;
