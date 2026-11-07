/**
 * Limits for projects. Kept apart from rules.ts so the database schema
 * (loaded by drizzle-kit without the "@/" alias) can import them for its
 * CHECK constraints. Caps are runaway-only: generous for real work.
 */
export const projectLimits = {
  /** Longest project name, in characters. Matches the old free-text column. */
  maxNameChars: 120,
  /** Projects in one scope (a person's own, or one team's). Stops runaway agents, never real work. */
  maxPerScope: 1000,
} as const;
