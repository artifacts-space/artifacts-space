/**
 * Limits for tags. Kept apart from rules.ts so the database schema (loaded by
 * drizzle-kit without the "@/" alias) can import them for its CHECK
 * constraint. Caps are runaway-only: generous for real work.
 */
export const tagLimits = {
  /** Longest tag, in characters. */
  maxChars: 32,
  /** Tags on one artifact. */
  maxPerArtifact: 20,
  /** Different tags in one scope (a person's own, or one team's). Stops runaway agents, never real work. */
  maxPerScope: 2000,
} as const;
