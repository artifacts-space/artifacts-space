"use client";

import { useCallback, useState } from "react";

import { replacementPickProblem, routeDrop, type DroppedEntry } from "@/lib/page-files/drop-rules";

import type { DroppedFile } from "./dropped-files";
import type { PageHtmlFile, RefusedFile } from "./page-file-rows";
import { newPageRow, type PageBatch, type PageRow } from "./use-page-batch";

/** What a drop leaves beside the set: files refused with a reason, the page itself when the drop held it, and how many hidden or system files were left out. */
export interface DropNotes {
  refused: RefusedFile[];
  page: PageHtmlFile | null;
  leftOut: number;
}

const noNotes: DropNotes = { refused: [], page: null, leftOut: 0 };

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
 * list. Replace on a page file's row sends one file at that file's path.
 */
export function usePageFilesIntake(batch: PageBatch, attach: (files: File[]) => void) {
  const [notes, setNotes] = useState<DropNotes>(noNotes);
  const { add } = batch;

  const take = useCallback((dropped: readonly DroppedFile[]) => {
    const sorted = sortDrop(dropped);
    add(sorted.pageRows);
    if (sorted.attachments.length > 0) attach(sorted.attachments);
    // The quiet line counts the latest drop; refusals stay until removed.
    setNotes((current) => ({ refused: [...current.refused, ...sorted.refused], page: sorted.page ?? current.page, leftOut: sorted.leftOut }));
  }, [add, attach]);

  const replaceAt = useCallback((path: string, file: File) => {
    const problem = replacementPickProblem(path, file);
    if (problem) { setNotes((current) => ({ ...current, refused: [...current.refused, { key: key("refused"), name: file.name, problem }] })); return; }
    add([newPageRow(file, path, true)]);
  }, [add]);

  const dropRefused = useCallback((refusedKey: string) => {
    setNotes((current) => ({ ...current, refused: current.refused.filter((entry) => entry.key !== refusedKey) }));
  }, []);

  const setPage = useCallback((page: PageHtmlFile | null) => { setNotes((current) => ({ ...current, page })); }, []);

  return { notes, take, replaceAt, dropRefused, setPage };
}
