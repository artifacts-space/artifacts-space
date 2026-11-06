/**
 * Hard limits for ui specs. Validation rejects a spec that crosses any of them,
 * and the renderer relies on them to stay fast and safe.
 */
export const uiLimits = {
  /** Largest spec, in UTF-8 bytes of its JSON text. */
  maxSpecBytes: 200_000,
  /** Most elements in one spec. */
  maxElements: 500,
  /** Deepest element nesting, counted from the root (root is depth 1). */
  maxDepth: 20,
  /** Most items a `repeat` may render from one state array. */
  maxRepeatItems: 200,
  /** Deepest JSON nesting anywhere in the spec (props, state, conditions). */
  maxJsonDepth: 64,
  /** Longest element key. */
  maxKeyLength: 100,
  /** Most issues reported back for one spec. */
  maxReportedIssues: 25,
} as const;
