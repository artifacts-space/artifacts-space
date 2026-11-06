import { randomBytes } from "node:crypto";

/** Bitcoin's base58 alphabet: no 0, O, I, or l. */
export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** 22 base58 characters carry about 129 bits. */
export const PUBLIC_ID_LENGTH = 22;
/** Largest multiple of 58 that fits in a byte; bytes at or above it are dropped to avoid bias. */
const REJECT_FROM = 232;

const publicIdPattern = /^[1-9A-HJ-NP-Za-km-z]{22}$/;

/**
 * A new 22-character random base58 id for an artifact's public URL. Uses a
 * cryptographically secure source and rejection sampling, so every character
 * is uniform. `random` is injectable for tests.
 */
export function generatePublicId(random: (size: number) => Uint8Array = randomBytes): string {
  let id = "";
  while (id.length < PUBLIC_ID_LENGTH) {
    for (const byte of random(32)) {
      if (byte >= REJECT_FROM) continue;
      id += BASE58_ALPHABET.charAt(byte % 58);
      if (id.length === PUBLIC_ID_LENGTH) break;
    }
  }
  return id;
}

/** True when `value` has the exact shape of a public id. Use before any lookup. */
export function isPublicId(value: string): boolean {
  return publicIdPattern.test(value);
}
