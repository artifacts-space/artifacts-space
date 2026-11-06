const MASK = "********";
const VISIBLE_TAIL = 4;
const MAX_PREFIX = 16;
/** Shorter secrets show no characters at all, so the mask never gives most of one away. */
const MIN_MASKABLE_LENGTH = 16;

/**
 * A secret shortened for display: its prefix (up to and including the first
 * underscore, as in "artifacts_"), eight asterisks, then its last four
 * characters. People can tell tokens apart without the full value on screen.
 */
export function maskSecret(secret: string): string {
  if (secret.length < MIN_MASKABLE_LENGTH) return MASK;
  const underscore = secret.indexOf("_");
  const prefix = underscore > 0 && underscore < MAX_PREFIX ? secret.slice(0, underscore + 1) : "";
  return `${prefix}${MASK}${secret.slice(-VISIBLE_TAIL)}`;
}
