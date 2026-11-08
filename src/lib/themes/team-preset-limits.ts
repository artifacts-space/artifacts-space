/**
 * Limits for team theme presets and the team default. Kept apart from the
 * rules so the database schema (loaded by drizzle-kit without the "@/"
 * alias) can import them for its CHECK constraints.
 */
export const teamPresetLimits = {
  /** Runaway cap: presets one team can keep. Never meant to ration normal use. */
  maxPerTeam: 50,
  maxNameChars: 60,
  maxDescriptionChars: 160,
  /** The slug part of "team:<slug>": a name part, a dash, and a random suffix. */
  maxSlugChars: 56,
  /** The longest stored reference, "team:" plus the slug, or a built-in id. */
  maxRefChars: 64,
  /** Runaway cap: revisions kept per preset, and for the team default. The oldest past it are pruned. */
  maxRevisions: 50,
  /** Database backstop on the stored theme jsonb text (the input limit is in artifactThemeLimits). */
  maxStoredBytes: 16_000,
} as const;
