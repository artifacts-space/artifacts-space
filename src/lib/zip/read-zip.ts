import { crc32End, crc32Start, crc32Update } from "./crc32";
import { readZipDirectory, type ZipEntryRecord, type ZipFault } from "./zip-format";
import { zipEntryName, shownZipName, type ZipNameProblem } from "./zip-names";

/*
 * Unpacks a zip file's entries into bytes, in the browser or on the
 * server, with no dependency: stored entries are copied, deflated ones go
 * through the platform's DecompressionStream("deflate-raw"). What comes
 * out is counted as it comes: an entry stops the moment it passes the size
 * its header declared (which is at most `maxEntryBytes`), and the zip stops
 * the moment its total passes `maxTotalBytes`, so a zip that lies about its
 * sizes never unpacks further than that. Each entry's CRC-32 must match.
 * Aborting the signal stops at once. A fault ends in a code, never a throw.
 *
 * The caller decides what an entry becomes: this hands over names and bytes.
 */

/** The caps a read keeps to. */
export interface ZipLimits {
  /** Largest zip read at all, in bytes. */
  maxZipBytes: number;
  /** Most entries (files and folders) a zip may list. */
  maxEntries: number;
  /** Largest entry unpacked; a larger one is listed as too large and never unpacked. */
  maxEntryBytes: number;
  /** Most bytes one zip unpacks to, all entries together. */
  maxTotalBytes: number;
}

/** Why one entry was left out: its name, a link or other special file, or a later entry at the same name. */
export type ZipLeftOutReason = ZipNameProblem | "special" | "duplicate";

/** One unpacked file: its name in the zip (slashes between folders) and its bytes. */
export interface UnpackedZipFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** A zip read through: what came out, what was left out and why, and how many bytes the reads produced. */
export interface ZipContents {
  files: UnpackedZipFile[];
  leftOut: { name: string; reason: ZipLeftOutReason }[];
  /** Entries over maxEntryBytes by their declared size, never unpacked. */
  tooLarge: { name: string; size: number }[];
  /** Entries the caller's `skip` left out, never unpacked. */
  skipped: number;
}

/** The outcome of a read. `bytesOut` counts every byte the reads produced, also on a fault. */
export type ZipRead = ({ ok: true } & ZipContents & { bytesOut: number }) | { ok: false; fault: ZipFault | "cancelled"; bytesOut: number };

export interface ZipReadOptions {
  limits: ZipLimits;
  signal?: AbortSignal | undefined;
  /** Names to leave out without unpacking them, such as hidden or system files. */
  skip?: ((name: string) => boolean) | undefined;
  /** How far the read is, from 0 to 1, by the bytes unpacked against those declared. */
  onProgress?: ((fraction: number) => void) | undefined;
}

/** One entry to unpack, with its usable name. */
interface Planned { name: string; record: ZipEntryRecord }

interface Plan extends ZipContents { unpack: Planned[] }

/** Sorts the directory's entries: what to unpack, what is left out and why. A later entry at a name wins over an earlier one. */
function planEntries(records: readonly ZipEntryRecord[], options: ZipReadOptions): Plan {
  const plan: Plan = { unpack: [], files: [], leftOut: [], tooLarge: [], skipped: 0 };
  const latest = new Map<string, Planned>();
  for (const record of records) {
    if (record.kind === "folder") continue;
    if (record.kind === "special") { plan.leftOut.push({ name: shownZipName(record.nameBytes), reason: "special" }); continue; }
    const named = zipEntryName(record.nameBytes);
    if (!named.ok) { plan.leftOut.push({ name: named.shown, reason: named.problem }); continue; }
    if (options.skip?.(named.name)) { plan.skipped += 1; continue; }
    const earlier = latest.get(named.name);
    if (earlier) plan.leftOut.push({ name: earlier.name, reason: "duplicate" });
    latest.set(named.name, { name: named.name, record });
  }
  for (const planned of latest.values()) {
    if (planned.record.size > options.limits.maxEntryBytes) plan.tooLarge.push({ name: planned.name, size: planned.record.size });
    else plan.unpack.push(planned);
  }
  return plan;
}

/** The count of what a read produced, shared by every entry of one zip. */
interface Tally { out: number; cap: number; declared: number; sinceBreak: number; onProgress: ((fraction: number) => void) | undefined }

type Unpacked = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; fault: ZipFault | "cancelled" };

/**
 * How much compressed data the inflater is handed at once. Deflate can grow
 * about a thousand times, and an inflater writes out all it can from what
 * it is handed before the reader counts any of it, so small pieces keep
 * what a lying zip can make before it is stopped to a few megabytes.
 */
const inflateInput = 4 * 1024;
/** Stored data is copied as it is, in larger pieces. */
const copyInput = 64 * 1024;
/** After about this much output the read lets the page draw and take a click (Cancel) before it goes on. */
const outputBetweenBreaks = 512 * 1024;

/** The bytes as a stream that hands out `size` bytes each time it is asked, and nothing before. */
function inPieces(bytes: Uint8Array<ArrayBuffer>, size: number): ReadableStream<Uint8Array<ArrayBuffer>> {
  let at = 0;
  return new ReadableStream({
    pull: (controller) => {
      if (at >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  }, { highWaterMark: 0 });
}

/** The entry's bytes as they come out: copied when stored, inflated when deflated. */
function outputOf(zip: Uint8Array<ArrayBuffer>, record: ZipEntryRecord): ReadableStream<Uint8Array> {
  const data = zip.subarray(record.dataStart, record.dataEnd);
  return record.method === 8 ? inPieces(data, inflateInput).pipeThrough(new DecompressionStream("deflate-raw")) : inPieces(data, copyInput);
}

/** Lets the page's other work run (drawing, a click) before the read goes on. A break of one task, not a wait for anything. */
function aBreak(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

function joined(parts: readonly Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}

/** Why the read must stop after this chunk, or null to go on. */
function stopAfter(got: number, record: ZipEntryRecord, tally: Tally, signal: AbortSignal | undefined): ZipFault | "cancelled" | null {
  if (signal?.aborted) return "cancelled";
  if (got > record.size) return "damaged";
  if (tally.out > tally.cap) return "unpacks-too-large";
  return null;
}

/** A reader of the entry's output, or null on a platform without the "deflate-raw" format, which cannot inflate it. */
function openOutput(zip: Uint8Array<ArrayBuffer>, record: ZipEntryRecord): ReadableStreamDefaultReader<Uint8Array> | null {
  try {
    return outputOf(zip, record).getReader();
  } catch {
    return null;
  }
}

/** Reports how far the read is, and takes a break once enough has come out since the last one. */
async function afterChunk(tally: Tally, length: number): Promise<void> {
  tally.onProgress?.(Math.min(1, tally.out / Math.max(1, tally.declared)));
  tally.sinceBreak += length;
  if (tally.sinceBreak < outputBetweenBreaks) return;
  tally.sinceBreak = 0;
  await aBreak();
}

/** Reads one entry's output, counting each chunk before it is kept, and stops the stream the moment a cap is passed. */
async function unpackEntry(zip: Uint8Array<ArrayBuffer>, record: ZipEntryRecord, tally: Tally, signal: AbortSignal | undefined): Promise<Unpacked> {
  const reader = openOutput(zip, record);
  if (!reader) return { ok: false, fault: "method" };
  const parts: Uint8Array[] = [];
  let got = 0;
  let crc = crc32Start;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      tally.out += value.length;
      const stop = stopAfter(got, record, tally, signal);
      if (stop) { await reader.cancel().catch(() => undefined); return { ok: false, fault: stop }; }
      crc = crc32Update(crc, value);
      parts.push(value);
      await afterChunk(tally, value.length);
    }
  } catch {
    // The inflater refused the data: cut short, or not deflate at all.
    return { ok: false, fault: signal?.aborted ? "cancelled" : "damaged" };
  }
  if (got !== record.size || crc32End(crc) !== record.crc) return { ok: false, fault: "damaged" };
  return { ok: true, bytes: joined(parts, got) };
}

/** Unpacks the planned entries one after another, within the zip's total. */
async function unpackAll(zip: Uint8Array<ArrayBuffer>, plan: Plan, tally: Tally, signal: AbortSignal | undefined): Promise<{ ok: true } | { ok: false; fault: ZipFault | "cancelled" }> {
  for (const planned of plan.unpack) {
    if (signal?.aborted) return { ok: false, fault: "cancelled" };
    const unpacked = await unpackEntry(zip, planned.record, tally, signal);
    if (!unpacked.ok) return unpacked;
    plan.files.push({ name: planned.name, bytes: unpacked.bytes });
  }
  return { ok: true };
}

/**
 * Reads a whole zip. Refused before anything is unpacked: a zip over
 * maxZipBytes, a directory that cannot be read (zip-format.ts), a zip that
 * lists no file, and a zip whose declared sizes add up past maxTotalBytes.
 */
export async function readZip(zip: Uint8Array<ArrayBuffer>, options: ZipReadOptions): Promise<ZipRead> {
  const { limits, signal } = options;
  if (zip.length > limits.maxZipBytes) return { ok: false, fault: "too-large", bytesOut: 0 };
  const directory = readZipDirectory(zip, limits.maxEntries);
  if (!directory.ok) return { ok: false, fault: directory.fault, bytesOut: 0 };
  const plan = planEntries(directory.entries, options);
  if (plan.unpack.length + plan.leftOut.length + plan.tooLarge.length + plan.skipped === 0) return { ok: false, fault: "empty", bytesOut: 0 };
  const declared = plan.unpack.reduce((sum, planned) => sum + planned.record.size, 0);
  if (declared > limits.maxTotalBytes) return { ok: false, fault: "unpacks-too-large", bytesOut: 0 };
  const tally: Tally = { out: 0, cap: limits.maxTotalBytes, declared, sinceBreak: 0, onProgress: options.onProgress };
  const done = await unpackAll(zip, plan, tally, signal);
  if (!done.ok) return { ok: false, fault: done.fault, bytesOut: tally.out };
  return { ok: true, files: plan.files, leftOut: plan.leftOut, tooLarge: plan.tooLarge, skipped: plan.skipped, bytesOut: tally.out };
}
