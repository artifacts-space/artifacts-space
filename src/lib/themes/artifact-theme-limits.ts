/**
 * Size limits for an artifact's stored theme. Kept apart from
 * artifact-theme.ts so the database schema (loaded by drizzle-kit without the
 * "@/" alias) can import them for its CHECK constraint.
 */
export const artifactThemeLimits = {
  /** Longest theme input, as JSON characters, before it is parsed. A full theme is about 1.5 KB. */
  maxInputChars: 8_000,
  /** Longest preset id input. */
  maxPresetIdChars: 64,
  /** Database backstop on the stored jsonb text. jsonb prints with extra spaces, so it allows twice the input limit. */
  maxStoredBytes: 16_000,
} as const;
