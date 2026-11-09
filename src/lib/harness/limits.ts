/**
 * Size caps for harness data, shared by the schema's check constraints and
 * the rules. Relative imports only: drizzle-kit loads this through the schema.
 */
export const harnessLimits = {
  /** A harness id such as "claude-code". */
  maxIdChars: 32,
  /** A client's own name, kept for "Other agent". */
  maxLabelChars: 64,
  /** A client's version string. */
  maxVersionChars: 32,
} as const;
