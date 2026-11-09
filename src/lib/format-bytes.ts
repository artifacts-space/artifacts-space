/**
 * Byte counts as people read them. Caps come in two units in this app:
 * binary (2 MB = 2,097,152 bytes, used by the image pickers) and decimal
 * (1 MB = 1,000,000 bytes, used where a cap must stay under a framework
 * limit with room to spare). Format each cap in its own unit, so the label
 * matches the rule it states. Labels round down to one decimal, so a printed
 * cap is never larger than the real one. Pure and client-safe.
 */

function roundedDown(value: number): string {
  // The small nudge keeps exact values such as 1.5 from flooring to 1.4 through float error.
  return String(Math.floor(value * 10 + 1e-9) / 10);
}

/** A binary byte cap as people read it: 2,097,152 is "2 MB". */
export function binaryMegabytes(bytes: number): string {
  return `${roundedDown(bytes / 1_048_576)} MB`;
}

/** A decimal byte cap as people read it: 1,000,000 is "1 MB". */
export function decimalMegabytes(bytes: number): string {
  return `${roundedDown(bytes / 1_000_000)} MB`;
}
