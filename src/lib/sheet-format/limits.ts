/**
 * Size limits for a sheet's saved formatting. Kept apart from rules.ts so
 * the database schema (loaded by drizzle-kit without the "@/" alias) can
 * import them for its CHECK constraint.
 */
export const sheetFormatLimits = {
  /** Most columns with their own alignment: the widest sheet the grid editor opens. */
  maxAlignedColumns: 100,
  /** Longest column key (a quoted column name, see columnKeys). Longer names cannot get their own alignment. */
  maxKeyChars: 200,
  /** Longest formatting input, as UTF-8 bytes of its JSON text, before it is parsed. */
  maxInputBytes: 24_000,
  /** Database backstop on the stored jsonb text, in the same bytes. jsonb prints with extra spaces, so it allows twice the input limit. */
  maxStoredBytes: 48_000,
} as const;
