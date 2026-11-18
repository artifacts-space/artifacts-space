"use client";

import { useCallback, useState } from "react";

import { replacementPickProblem, routeDrop, type DroppedEntry } from "@/lib/page-files/drop-rules";
import { unpacksAsZip, type ZipSource } from "@/lib/page-files/zip-rules";

import type { DroppedFile } from "./dropped-files";
import type { PageHtmlFile, RefusedFile } from "./page-file-rows";
import type { UnpackedDrop, ZipReader } from "./unpack-drop";
import { newPageRow, type PageBatch, type PageRow } from "./use-page-batch";
import { useZipUnpack } from "./use-zip-unpack";

/** A zip the latest drop unpacked: its name, how many files it held, and the zip itself, for "Attach the zip as it is". */
export type DropSource = ZipSource & { key: string; file: File; attached: boolean };

/** What a drop leaves beside the set: files refused with a reason, the page itself when the drop held it, how many hidden or system files were left out, and the zips it unpacked. */
export interface DropNotes {
  refused: RefusedFile[];
  page: PageHtmlFile | null;
  leftOut: number;
  sources: DropSource[];
}

const noNotes: DropNotes = { refused: [], page: null, leftOut: 0, sources: [] };

/** A drop that held no zip: nothing beside its own files. */
const plainDrop: Omit<UnpackedDrop, "files"> = { refused: [], leftOut: 0, sources: [] };

let nextKey = 0;
function key(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${String(nextKey)}`;
}

function entryOf(dropped: DroppedFile): DroppedEntry {
  return { name: dropped.file.name, size: dropped.file.size, type: dropped.file.type, relativePath: dropped.relativePath, fromFolder: dropped.fromFolder };
}

/** One drop, sorted by where each file goes (routeDrop). */
interface Sorted {
  pageRows: PageRow[];
  attachments: File[];
  refused: RefusedFile[];
  page: PageHtmlFile | null;
  leftOut: number;
}

function sortDrop(dropped: readonly DroppedFile[]): Sorted {
  const sorted: Sorted = { pageRows: [], attachments: [], refused: [], page: null, leftOut: 0 };
  routeDrop(dropped.map(entryOf)).forEach((route, index) => {
    const entry = dropped[index];
    if (!entry) return;
    if (route.kind === "page") sorted.pageRows.push(newPageRow(entry.file, route.path));
    else if (route.kind === "attachment") sorted.attachments.push(entry.file);
    else if (route.kind === "page-html") sorted.page = { key: key("html"), file: entry.file, problem: null };
    else if (route.kind === "refused") sorted.refused.push({ key: key("refused"), name: entry.relativePath, problem: route.problem });
    else sorted.leftOut += 1;
  });
  return sorted;
}

/**
 * Takes the files of one drop or pick on a web page and sends each where
 * its type belongs (routeDrop): page files into the set (usePageBatch),
 * attachments to the plain uploader, and the rest to the notes beside the
 * list. A drop that holds a zip is unpacked first (useZipUnpack), and its
 * files go the same way, as a dropped folder's would. Replace on a page
 * file's row sends one file at that file's path.
 */
export function usePageFilesIntake(batch: PageBatch, attach: (files: File[]) => void, readZip?: ZipReader) {
  const [notes, setNotes] = useState<DropNotes>(noNotes);
  const { add } = batch;

  const route = useCallback((dropped: readonly DroppedFile[], beside: Omit<UnpackedDrop, "files">) => {
    const sorted = sortDrop(dropped);
    add(sorted.pageRows);
    if (sorted.attachments.length > 0) attach(sorted.attachments);
    const refused = [...beside.refused.map((entry) => ({ key: key("refused"), ...entry })), ...sorted.refused];
    const sources = beside.sources.map((source) => ({ key: key("zip"), ...source, attached: false }));
    // The quiet lines count the latest drop; refusals stay until removed.
    setNotes((current) => ({ refused: [...current.refused, ...refused], page: sorted.page ?? current.page, leftOut: sorted.leftOut + beside.leftOut, sources }));
  }, [add, attach]);

  const zips = useZipUnpack(useCallback((drop: UnpackedDrop) => { route(drop.files, drop); }, [route]), readZip);
  const { unpack } = zips;

  const take = useCallback((dropped: readonly DroppedFile[]) => {
    if (dropped.some((entry) => unpacksAsZip({ name: entry.file.name, fromFolder: entry.fromFolder }))) unpack(dropped);
    else route(dropped, plainDrop);
  }, [route, unpack]);

  /** Attaches a zip that was unpacked as the zip itself, for someone who wanted the file; what it held stays as it went. */
  const attachZip = useCallback((sourceKey: string) => {
    const source = notes.sources.find((entry) => entry.key === sourceKey);
    if (!source || source.attached) return;
    attach([source.file]);
    setNotes((current) => ({ ...current, sources: current.sources.map((entry) => (entry.key === sourceKey ? { ...entry, attached: true } : entry)) }));
  }, [attach, notes.sources]);

  const replaceAt = useCallback((path: string, file: File) => {
    const problem = replacementPickProblem(path, file);
    if (problem) { setNotes((current) => ({ ...current, refused: [...current.refused, { key: key("refused"), name: file.name, problem }] })); return; }
    add([newPageRow(file, path, true)]);
  }, [add]);

  const dropRefused = useCallback((refusedKey: string) => {
    setNotes((current) => ({ ...current, refused: current.refused.filter((entry) => entry.key !== refusedKey) }));
  }, []);

  const setPage = useCallback((page: PageHtmlFile | null) => { setNotes((current) => ({ ...current, page })); }, []);

  return { notes, take, replaceAt, dropRefused, setPage, attachZip, unpacking: zips.unpacking, cancelUnpacking: zips.cancel };
}
