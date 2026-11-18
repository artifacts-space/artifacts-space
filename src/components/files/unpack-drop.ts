import { leftOutOfDrop, routeDrop } from "@/lib/page-files/drop-rules";
import { cannotUnpackWords, pageZipLimits, unpacksAsZip, unreadableZipWords, zipFaultWords, zipLeftOutWords, type ZipSource } from "@/lib/page-files/zip-rules";
import { readZip, type ZipContents } from "@/lib/zip/read-zip";

import type { DroppedFile } from "./dropped-files";

/*
 * Turns the zips of a drop on a web page into the files they hold, so the
 * drop goes on as if the person had dropped what each zip holds: each
 * entry is a file of a folder, at its path in the zip, and the drop's own
 * rules (routeDrop) decide the rest, for the zips' files and the drop's
 * other files together. Entries are File objects and nothing else: nothing
 * from a zip is shown or run here.
 */

/** A file of a drop that is not added, and why. */
export interface UnpackRefusal {
  name: string;
  problem: string;
}

/** A drop with its zips unpacked: the files that go on, what was refused, how many files were left out quietly, and each zip that was unpacked. */
export interface UnpackedDrop {
  files: DroppedFile[];
  refused: UnpackRefusal[];
  leftOut: number;
  sources: (ZipSource & { file: File })[];
}

/** Reads a zip's bytes and its entries; a test or fixture can hand its own. */
export type ZipReader = typeof readZip;

export interface UnpackOptions {
  signal: AbortSignal;
  /** Which zip is being read, and how far, from 0 to 1. */
  onProgress: (name: string, fraction: number) => void;
  read?: ZipReader | undefined;
  /** False in a browser without DecompressionStream. */
  canUnpack?: boolean | undefined;
}

/** A hidden or system file, as a dropped folder leaves it out (leftOutOfDrop): never unpacked. */
const quietlyLeftOut = (name: string) => leftOutOfDrop({ relativePath: name, fromFolder: true });

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** A file the zip lists over the largest file: refused in the words a dropped folder's file of that size would get. */
function tooLargeRefusal(zipName: string, entry: { name: string; size: number }): UnpackRefusal {
  const [route] = routeDrop([{ name: baseName(entry.name), size: entry.size, type: "", relativePath: entry.name, fromFolder: true }]);
  const problem = route?.kind === "refused" ? route.problem : zipFaultWords("unpacks-too-large", 0);
  return { name: `${entry.name} (in ${zipName})`, problem };
}

/** Adds what one zip held to the drop. */
function addContents(drop: UnpackedDrop, zip: File, contents: ZipContents): void {
  const files = contents.files.map((entry): DroppedFile => ({ file: new File([entry.bytes], baseName(entry.name)), relativePath: entry.name, fromFolder: true }));
  drop.files.push(...files);
  drop.refused.push(...contents.leftOut.map((entry) => ({ name: `${entry.name} (in ${zip.name})`, problem: zipLeftOutWords(entry.reason) })));
  drop.refused.push(...contents.tooLarge.map((entry) => tooLargeRefusal(zip.name, entry)));
  drop.leftOut += contents.skipped;
  drop.sources.push({ name: zip.name, count: files.length, file: zip });
}

type ZipOutcome = { kind: "read"; contents: ZipContents } | { kind: "refused"; problem: string } | { kind: "cancelled" };

/** Reads one zip, within the page's caps. */
async function readOne(zip: File, options: UnpackOptions): Promise<ZipOutcome> {
  if (options.canUnpack === false) return { kind: "refused", problem: cannotUnpackWords };
  if (zip.size > pageZipLimits.maxZipBytes) return { kind: "refused", problem: zipFaultWords("too-large", zip.size) };
  const bytes = await zip.arrayBuffer().then((buffer) => new Uint8Array(buffer)).catch(() => null);
  if (!bytes) return { kind: "refused", problem: unreadableZipWords };
  if (options.signal.aborted) return { kind: "cancelled" };
  const read = options.read ?? readZip;
  const result = await read(bytes, { limits: pageZipLimits, signal: options.signal, skip: quietlyLeftOut, onProgress: (fraction) => { options.onProgress(zip.name, fraction); } });
  if (result.ok) return { kind: "read", contents: result };
  return result.fault === "cancelled" ? { kind: "cancelled" } : { kind: "refused", problem: zipFaultWords(result.fault, zip.size) };
}

/** True in a browser that can inflate a zip's entries. */
export function browserCanUnpack(): boolean {
  return typeof DecompressionStream === "function";
}

/**
 * Unpacks every zip of a drop (unpacksAsZip), one after another, and keeps
 * the drop's other files in their places. A zip that cannot be unpacked is
 * refused with the reason and adds nothing; the rest of the drop still
 * goes on. Null when the signal stopped it: nothing is added then.
 */
export async function unpackDrop(dropped: readonly DroppedFile[], options: UnpackOptions): Promise<UnpackedDrop | null> {
  const drop: UnpackedDrop = { files: [], refused: [], leftOut: 0, sources: [] };
  for (const entry of dropped) {
    if (!unpacksAsZip({ name: entry.file.name, fromFolder: entry.fromFolder })) { drop.files.push(entry); continue; }
    const outcome = await readOne(entry.file, options).catch((): ZipOutcome => ({ kind: "refused", problem: zipFaultWords("damaged", entry.file.size) }));
    if (outcome.kind === "cancelled" || options.signal.aborted) return null;
    if (outcome.kind === "refused") drop.refused.push({ name: entry.file.name, problem: outcome.problem });
    else addContents(drop, entry.file, outcome.contents);
  }
  return drop;
}
