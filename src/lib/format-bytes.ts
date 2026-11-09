/**
 * Byte counts as people read them. Caps come in two units in this app:
 * binary (2 MB = 2,097,152 bytes, used by the image pickers) and decimal
 * (1 MB = 1,000,000 bytes, used where a cap must stay under a framework
 * limit with room to spare). Format each cap in its own unit, so the label
 * always matches the rule it states. Pure and client-safe.
 */

function rounded(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** A binary byte cap as people read it: 2,097,152 is "2 MB". */
export function binaryMegabytes(bytes: number): string {
  return `${rounded(bytes / 1_048_576)} MB`;
}

/** A decimal byte cap as people read it: 1,000,000 is "1 MB". */
export function decimalMegabytes(bytes: number): string {
  return `${rounded(bytes / 1_000_000)} MB`;
}
