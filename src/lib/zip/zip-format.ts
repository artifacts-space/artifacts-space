/*
 * The directory of a zip file: the end record, the central directory, and
 * where each entry's data lies, read from bytes a stranger made. Nothing
 * the zip declares is trusted: every offset and length is checked against
 * the real bytes before it is read, every loop advances through real bytes
 * or stops, and the data of two entries may not overlap (a zip whose
 * entries share their data unpacks to many times its size). A fault ends
 * in a code, never a throw. Only one-part, unencrypted zips whose entries
 * are stored or deflated are read; zip64 is refused.
 *
 * Pure, safe for the server and the browser.
 */

/** Why a zip cannot be read. The words for people are the caller's. */
export type ZipFault =
  | "not-zip"
  | "empty"
  | "encrypted"
  | "zip64"
  | "split"
  | "method"
  | "damaged"
  | "too-many-entries"
  | "too-large"
  | "unpacks-too-large";

/** What one entry is, from its name and its attributes. */
export type ZipEntryKind = "file" | "folder" | "special";

/** One entry as the central directory lists it, with its data's place checked against the bytes. */
export interface ZipEntryRecord {
  nameBytes: Uint8Array;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  /** Where its local header starts, and where its data starts and ends, in the zip. */
  headerStart: number;
  dataStart: number;
  dataEnd: number;
  kind: ZipEntryKind;
}

/** The directory of a zip, or why it cannot be read. */
export type ZipDirectory = { ok: true; entries: ZipEntryRecord[] } | { ok: false; fault: ZipFault };

const signatures = { end: 0x06054b50, central: 0x02014b50, local: 0x04034b50, zip64Locator: 0x07064b50 } as const;
const sizes = { end: 22, central: 46, local: 30, zip64Locator: 20, maxComment: 0xffff } as const;
/** Flags: bit 0 encrypted, bit 6 strong encryption, bit 13 the directory encrypted. */
const encryptedFlags = 0x0001 | 0x0040 | 0x2000;
/** Hosts whose external attributes hold a Unix file mode: Unix, and OS X. */
const unixHosts = new Set([3, 19]);
const fileTypeMask = 0o170000;
const regularFile = 0o100000;
const folderMode = 0o040000;
/** The DOS attribute bit of a folder. */
const dosFolder = 0x10;

/** A view of the zip's bytes that reads only inside them: a read that would leave them gives -1. */
interface Bytes {
  bytes: Uint8Array;
  length: number;
  u16: (at: number) => number;
  u32: (at: number) => number;
}

function bytesOf(bytes: Uint8Array): Bytes {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const holds = (at: number, length: number) => Number.isSafeInteger(at) && at >= 0 && at + length <= bytes.length;
  return {
    bytes,
    length: bytes.length,
    u16: (at) => (holds(at, 2) ? view.getUint16(at, true) : -1),
    u32: (at) => (holds(at, 4) ? view.getUint32(at, true) : -1),
  };
}

function fault(code: ZipFault): { ok: false; fault: ZipFault } {
  return { ok: false, fault: code };
}

/** Where the end record starts: the last place its signature sits with a comment that runs exactly to the end of the file. */
function findEnd(zip: Bytes): number | null {
  const last = zip.length - sizes.end;
  const first = Math.max(0, last - sizes.maxComment);
  for (let at = last; at >= first; at -= 1) {
    if (zip.u32(at) === signatures.end && at + sizes.end + zip.u16(at + 20) === zip.length) return at;
  }
  return null;
}

interface EndRecord { count: number; directoryStart: number; directoryEnd: number }

/** True when the end record says the zip is zip64: a zip64 locator just before it, or a field at its largest value, which means "see the zip64 record". */
function endIsZip64(zip: Bytes, at: number): boolean {
  if (zip.u32(at - sizes.zip64Locator) === signatures.zip64Locator) return true;
  return zip.u16(at + 10) === 0xffff || zip.u32(at + 12) === 0xffffffff || zip.u32(at + 16) === 0xffffffff;
}

/** The end record's facts, once every one of them is checked. */
function readEnd(zip: Bytes, at: number): { ok: true; end: EndRecord } | { ok: false; fault: ZipFault } {
  const [disk, directoryDisk, onDisk, count] = [zip.u16(at + 4), zip.u16(at + 6), zip.u16(at + 8), zip.u16(at + 10)];
  const [directorySize, directoryStart] = [zip.u32(at + 12), zip.u32(at + 16)];
  if (endIsZip64(zip, at)) return fault("zip64");
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== count) return fault("split");
  if (count === 0) return fault("empty");
  if (directoryStart + directorySize > at || directorySize < count * sizes.central) return fault("damaged");
  return { ok: true, end: { count, directoryStart, directoryEnd: directoryStart + directorySize } };
}

/** True when the extra fields hold a zip64 record (id 1). Walks the real bytes only. */
function hasZip64Extra(zip: Bytes, start: number, end: number): boolean {
  let at = start;
  while (at + 4 <= end) {
    if (zip.u16(at) === 0x0001) return true;
    at += 4 + zip.u16(at + 2);
  }
  return false;
}

/** What an entry is: a folder by its name or attributes, a link or other special file by its Unix mode, a file otherwise. */
function kindOf(made: number, attributes: number, nameBytes: Uint8Array): ZipEntryKind {
  const lastByte = nameBytes.at(-1);
  if (lastByte === 0x2f || lastByte === 0x5c) return "folder";
  if (unixHosts.has(made >>> 8)) {
    const type = (attributes >>> 16) & fileTypeMask;
    if (type === folderMode) return "folder";
    if (type !== 0 && type !== regularFile) return "special";
  }
  return (attributes & dosFolder) !== 0 ? "folder" : "file";
}

interface CentralFacts {
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  nameBytes: Uint8Array;
  headerStart: number;
  kind: ZipEntryKind;
  next: number;
}

/** One central directory header at `at`, inside the directory. */
function readCentral(zip: Bytes, at: number, directoryEnd: number): { ok: true; facts: CentralFacts } | { ok: false; fault: ZipFault } {
  if (at + sizes.central > directoryEnd || zip.u32(at) !== signatures.central) return fault("damaged");
  const [nameLength, extraLength, commentLength] = [zip.u16(at + 28), zip.u16(at + 30), zip.u16(at + 32)];
  const nameStart = at + sizes.central;
  const next = nameStart + nameLength + extraLength + commentLength;
  if (next > directoryEnd) return fault("damaged");
  const [compressedSize, size, headerStart] = [zip.u32(at + 20), zip.u32(at + 24), zip.u32(at + 42)];
  if ([compressedSize, size, headerStart].includes(0xffffffff) || zip.u16(at + 34) === 0xffff) return fault("zip64");
  if (hasZip64Extra(zip, nameStart + nameLength, nameStart + nameLength + extraLength)) return fault("zip64");
  if (zip.u16(at + 34) !== 0) return fault("split");
  const nameBytes = zip.bytes.slice(nameStart, nameStart + nameLength);
  const kind = kindOf(zip.u16(at + 4), zip.u32(at + 38), nameBytes);
  return { ok: true, facts: { flags: zip.u16(at + 8), method: zip.u16(at + 10), crc: zip.u32(at + 16), compressedSize, size, nameBytes, headerStart, kind, next } };
}

/** The entry's data, placed by its local header, which must sit before the directory with the data inside it. */
function placeData(zip: Bytes, facts: CentralFacts, directoryStart: number): { ok: true; entry: ZipEntryRecord } | { ok: false; fault: ZipFault } {
  const at = facts.headerStart;
  if (at + sizes.local > directoryStart || zip.u32(at) !== signatures.local) return fault("damaged");
  if ((zip.u16(at + 6) & encryptedFlags) !== 0) return fault("encrypted");
  if (zip.u16(at + 8) !== facts.method) return fault("damaged");
  const dataStart = at + sizes.local + zip.u16(at + 26) + zip.u16(at + 28);
  const dataEnd = dataStart + facts.compressedSize;
  if (dataEnd > directoryStart) return fault("damaged");
  const method = facts.method === 8 ? 8 : 0;
  if (method === 0 && facts.compressedSize !== facts.size) return fault("damaged");
  return { ok: true, entry: { nameBytes: facts.nameBytes, method, crc: facts.crc, compressedSize: facts.compressedSize, size: facts.size, headerStart: at, dataStart, dataEnd, kind: facts.kind } };
}

/** One entry: its central header, its checks, and its data's place. */
function readEntry(zip: Bytes, at: number, end: EndRecord): { ok: true; entry: ZipEntryRecord; next: number } | { ok: false; fault: ZipFault } {
  const central = readCentral(zip, at, end.directoryEnd);
  if (!central.ok) return central;
  const { facts } = central;
  if ((facts.flags & encryptedFlags) !== 0) return fault("encrypted");
  if (facts.method !== 0 && facts.method !== 8) return fault("method");
  const placed = placeData(zip, facts, end.directoryStart);
  return placed.ok ? { ok: true, entry: placed.entry, next: facts.next } : placed;
}

/** True when no two entries' local headers and data overlap. */
function apart(entries: readonly ZipEntryRecord[]): boolean {
  const ordered = [...entries].sort((first, second) => first.headerStart - second.headerStart);
  return ordered.every((entry, index) => index === 0 || entry.headerStart >= (ordered[index - 1]?.dataEnd ?? Infinity));
}

/** Every entry the directory lists, read from exactly the directory's bytes. */
function readEntries(zip: Bytes, end: EndRecord): ZipDirectory {
  const entries: ZipEntryRecord[] = [];
  let at = end.directoryStart;
  for (let index = 0; index < end.count; index += 1) {
    const read = readEntry(zip, at, end);
    if (!read.ok) return read;
    entries.push(read.entry);
    at = read.next;
  }
  if (at !== end.directoryEnd || !apart(entries)) return fault("damaged");
  return { ok: true, entries };
}

/**
 * Reads a zip's directory. A file with no end record is not a zip, unless
 * it starts as one, when it is a zip cut short. More than `maxEntries`
 * entries is refused before any is read.
 */
export function readZipDirectory(bytes: Uint8Array, maxEntries: number): ZipDirectory {
  try {
    const zip = bytesOf(bytes);
    const endAt = findEnd(zip);
    if (endAt === null) return fault(zip.u32(0) === signatures.local ? "damaged" : "not-zip");
    const end = readEnd(zip, endAt);
    if (!end.ok) return end;
    if (end.end.count > maxEntries) return fault("too-many-entries");
    return readEntries(zip, end.end);
  } catch {
    // Every read is checked first; this only keeps a fault the checks missed from escaping.
    return fault("damaged");
  }
}
