/*
 * CRC-32 as zip files use it (the IEEE polynomial, reflected), so a reader
 * can tell bytes that came out whole from bytes that were cut or changed.
 * Pure, safe for the server and the browser.
 */

const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** The CRC-32 state after `bytes`, from `state` (start with crc32Start). */
export function crc32Update(state: number, bytes: Uint8Array): number {
  let value = state;
  for (const byte of bytes) value = (table[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  return value >>> 0;
}

/** The state before any byte. */
export const crc32Start = 0xffffffff;

/** The finished CRC-32 of a state. */
export function crc32End(state: number): number {
  return (state ^ 0xffffffff) >>> 0;
}

/** The CRC-32 of these bytes. */
export function crc32(bytes: Uint8Array): number {
  return crc32End(crc32Update(crc32Start, bytes));
}
