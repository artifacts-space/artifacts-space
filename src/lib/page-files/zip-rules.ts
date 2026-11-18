import { fileExtension, fileLimits, formatBytes } from "@/lib/files/config";
import type { ZipLeftOutReason, ZipLimits } from "@/lib/zip/read-zip";
import type { ZipFault } from "@/lib/zip/zip-format";

import { pageFileLimits } from "./rules";

/*
 * A zip dropped or picked on an HTML artifact's page is unpacked in the
 * browser and its files go the way a dropped folder's would
 * (drop-rules.ts). This holds the caps the unpacking keeps to and what a
 * person reads when a zip, or a file in it, is not added. The server checks
 * every file again on upload and publish; the zip is only a way to pick
 * files.
 *
 * Pure rules, safe for the server and the browser.
 */

/** Most entries, files and folders, read from one zip: twice the files a dropped folder is read for, since a zip also lists each folder as an entry. */
const maxZipEntries = 2000;

/**
 * The caps on one zip. An entry is at most the largest file the site takes
 * (a page file and an attachment have the same cap). All entries together
 * unpack to at most every page file one artifact may hold plus one file of
 * that largest size, a little above what a page can take from one drop. A
 * zip is never larger than what it unpacks to, so a larger one is refused
 * before it is read.
 */
export const pageZipLimits: ZipLimits = {
  maxZipBytes: pageFileLimits.maxTotalBytes + fileLimits.maxBytes,
  maxEntries: maxZipEntries,
  maxEntryBytes: fileLimits.maxBytes,
  maxTotalBytes: pageFileLimits.maxTotalBytes + fileLimits.maxBytes,
};

/** True for a file the page unpacks: a `.zip` dropped or picked by itself. A zip inside a dropped folder is a file of that folder, attached as before. */
export function unpacksAsZip(entry: { name: string; fromFolder: boolean }): boolean {
  return !entry.fromFolder && fileExtension(entry.name) === "zip";
}

/** What a person reads in a browser that cannot unpack a zip. */
export const cannotUnpackWords = "This browser cannot unpack a zip. Unpack it and drop the folder.";

/** What a person reads when a zip's bytes could not be read from the disk. */
export const unreadableZipWords = "The zip could not be read. Drop it again.";

const unpackIt = "Unpack it and drop the folder.";

/** Why a whole zip is not unpacked, in a person's words. */
export function zipFaultWords(fault: ZipFault, zipSize: number): string {
  const words: Record<ZipFault, string> = {
    "not-zip": "This file is not a zip, though its name ends in .zip.",
    empty: "This zip holds no files.",
    encrypted: `This zip is locked with a password. ${unpackIt}`,
    zip64: `This zip uses the zip64 format for very large zips, which cannot be unpacked here. ${unpackIt}`,
    split: `This zip is one part of a zip split into parts. Join the parts, or ${unpackIt.toLowerCase()}`,
    method: `This zip packs its files in a way that cannot be unpacked here. ${unpackIt}`,
    damaged: `This zip is damaged or cut short. Make it again, or ${unpackIt.toLowerCase()}`,
    "too-many-entries": `This zip holds more than ${maxZipEntries.toLocaleString("en-US")} files and folders. Drop only the files the page needs.`,
    "too-large": `This zip is ${formatBytes(zipSize)}. A zip of at most ${formatBytes(pageZipLimits.maxZipBytes)} can be unpacked here.`,
    "unpacks-too-large": `This zip unpacks to more than ${formatBytes(pageZipLimits.maxTotalBytes)}, more than a page can hold. Drop only the files the page needs.`,
  };
  return words[fault];
}

/** Why one file of a zip was left out, in a person's words. */
export function zipLeftOutWords(reason: ZipLeftOutReason): string {
  const words: Record<ZipLeftOutReason, string> = {
    "unsafe-name": "Its name points outside the zip's folder, so it was left out.",
    "unreadable-name": "Its name is not readable text, so it was left out.",
    "long-name": "Its name is longer than any path a page can take, so it was left out.",
    special: "It is a link or a special file, not a file, so it was left out.",
    duplicate: "The zip holds another file at this name later on. That later file was kept.",
  };
  return words[reason];
}

/** One zip of a drop that was unpacked: its name and how many of its files went on to the page's rules. */
export interface ZipSource {
  name: string;
  count: number;
}

/** The one line that says where a drop's files came from, such as "From site.zip: 14 files.", or null when no zip was unpacked. */
export function fromZipWords(sources: readonly ZipSource[]): string | null {
  if (sources.length === 0) return null;
  const parts = sources.map((source) => `${source.name}: ${source.count === 1 ? "1 file" : `${String(source.count)} files`}`);
  return `From ${parts.join("; from ")}.`;
}
