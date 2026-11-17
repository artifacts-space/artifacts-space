import { fileLimits, formatBytes } from "@/lib/files/config";

import { pageFileLimits, pageFileTotalsProblem, pagePathProblem } from "./rules";

/*
 * Many page files in few calls: the rules for asking for the uploads of a
 * whole set (page_files_request_uploads) and for bringing a page's files to
 * a new state in one step (page_files_publish): new files added, files at
 * paths the page already has replaced, files removed.
 *
 * Pure rules, safe for the server and the browser.
 */

/** The limits of one call. */
export const pageBatchLimits = {
  /**
   * Most uploads one page_files_request_uploads call starts. What bounds it
   * is the answer, not the server: each file's signed address is about 450
   * characters, so the answer is about 0.75 KB per file, and an agent reads
   * all of it into its context. 50 files are about 38 KB, some 12,000 to
   * 15,000 tokens, which fits the limit common agent clients put on one
   * tool result (25,000 tokens); 100 would not. The host's limits are far
   * away: it allows a request or an answer 4.5 MB, signing an address is
   * local arithmetic, and the rows go in with one insert. A larger site
   * asks twice and still publishes once.
   */
  maxUploadsPerRequest: 50,
  /**
   * Most uploads, and most removals, one page_files_publish call names: as
   * many as one artifact holds, so any state of a page's files is one call
   * and one version. Ids and paths are short, so the request is a few
   * kilobytes. Publishing checks each unfinished upload in file storage
   * (two small requests per file); eight at a time, 100 files take about
   * three seconds, far under a request's time limit.
   */
  maxFilesPerPublish: pageFileLimits.maxFiles,
  /**
   * Most uploads one person may have waiting to finish at once, counting
   * those a call asks for: two whole sites. An agent whose upload addresses
   * ran out before it sent every file asks for the set again; the first
   * set's uploads still wait (they lapse after an hour), so one full retry
   * must fit beside them.
   */
  maxPendingUploads: pageFileLimits.maxFiles * 2,
  /** How many uploads a publish checks in file storage at once. */
  checksAtOnce: 8,
} as const;

/** One file of a set, as a call names it. */
export interface RequestedPageFile {
  path: string;
  size: number;
}

/** A page file the artifact holds. */
export interface HeldPageFile {
  id: string;
  pagePath: string;
  size: number;
}

/** One thing wrong with a set: the path at fault, and why. */
export interface PageFileFault {
  path: string;
  problem: string;
}

/** Why a file of this size cannot be a page file (empty, or over the limit for one file), or null when it can. */
export function pageFileSizeProblem(size: number): string | null {
  if (!Number.isInteger(size) || size <= 0) return "The file is empty. Give its exact size in bytes.";
  if (size > fileLimits.maxBytes) return `The file is ${formatBytes(size)}. The limit is ${formatBytes(fileLimits.maxBytes)}.`;
  return null;
}

/** The paths that appear more than once among these, counting paths that differ only by letter case as one. Each is named once, as first written. */
export function repeatedPaths(paths: readonly string[]): string[] {
  const seen = new Map<string, { path: string; count: number }>();
  for (const path of paths) {
    const key = path.toLowerCase();
    const known = seen.get(key);
    if (known) known.count += 1;
    else seen.set(key, { path, count: 1 });
  }
  return [...seen.values()].filter((entry) => entry.count > 1).map((entry) => entry.path);
}

/**
 * The file the page holds at this path, or at one that differs from it only
 * by letter case, and whether the path is the same letter for letter.
 */
export function heldAt(held: readonly HeldPageFile[], path: string): { file: HeldPageFile; exact: boolean } | null {
  const exact = held.find((file) => file.pagePath === path);
  if (exact) return { file: exact, exact: true };
  const twin = held.find((file) => file.pagePath.toLowerCase() === path.toLowerCase());
  return twin ? { file: twin, exact: false } : null;
}

/** Why each file of a set cannot be one of this page's files, by itself: its path, its size, a path named twice, a path that differs only by case from one the page has. */
function fileFaults(files: readonly RequestedPageFile[], held: readonly HeldPageFile[], removing: ReadonlySet<string>): PageFileFault[] {
  const faults: PageFileFault[] = [];
  for (const file of files) {
    const problem = pagePathProblem(file.path) ?? pageFileSizeProblem(file.size);
    if (problem) faults.push({ path: file.path, problem });
  }
  for (const path of repeatedPaths(files.map((file) => file.path))) {
    faults.push({ path, problem: "This path is named more than once, or twice with different upper and lower case. Name each path once." });
  }
  for (const file of files) {
    const at = heldAt(held, file.path);
    if (at && !at.exact) {
      faults.push({ path: file.path, problem: `The page already has ${at.file.pagePath}, which differs only by upper and lower case. Use that exact path to replace it, or remove it in a call of its own first.` });
    }
    if (removing.has(file.path)) faults.push({ path: file.path, problem: "This path is both uploaded and removed. To replace a file, upload it at the same path and leave it out of the removals." });
  }
  return faults;
}

/** Why each path to remove cannot be removed: the page holds no file there. */
function removalFaults(remove: readonly string[], held: readonly HeldPageFile[]): PageFileFault[] {
  const paths = new Set(held.map((file) => file.pagePath));
  const faults = remove.filter((path) => !paths.has(path)).map((path) => ({ path, problem: "The page has no file at this path, so there is nothing to remove. Paths match letter for letter." }));
  return [...faults, ...repeatedPaths(remove).map((path) => ({ path, problem: "This path is named more than once among the removals." }))];
}

/** The path a fault names when it is about the whole set (the page's limits), not one file. */
export const wholeSetFault = "(all files)";

/** What a set does to a page's files. */
export interface PagePublishPlan {
  /** Files at paths the page does not have yet. */
  adds: RequestedPageFile[];
  /** Files at paths the page has: each takes the place of the held file at that path. */
  replaces: { file: RequestedPageFile; held: HeldPageFile }[];
  /** Held files that go. */
  removes: HeldPageFile[];
  /** How many page files the artifact holds afterwards, and their total size. */
  totals: { count: number; bytes: number };
}

/** A set that fits, or everything wrong with it. */
export type PagePublishCheck = { ok: true; plan: PagePublishPlan } | { ok: false; faults: PageFileFault[] };

/**
 * Checks a whole set against the page's files before anything is signed or
 * changed, and says what it would do. Every fault is found, not only the
 * first, so one refusal names every file to fix. The limits are checked
 * for the page as the set leaves it: a file that replaces one counts in its
 * place, and a removed file counts no more.
 */
export function planPagePublish(files: readonly RequestedPageFile[], remove: readonly string[], held: readonly HeldPageFile[]): PagePublishCheck {
  const removing = new Set(remove);
  const faults = [...fileFaults(files, held, removing), ...removalFaults(remove, held)];
  if (faults.length > 0) return { ok: false, faults };
  const removes = held.filter((file) => removing.has(file.pagePath));
  const replaces = files.flatMap((file) => {
    const at = heldAt(held, file.path);
    return at?.exact && !removing.has(at.file.pagePath) ? [{ file, held: at.file }] : [];
  });
  const replaced = new Set(replaces.map((pair) => pair.file.path));
  const adds = files.filter((file) => !replaced.has(file.path));
  const gone = new Set([...removes, ...replaces.map((pair) => pair.held)].map((file) => file.id));
  const kept = held.filter((file) => !gone.has(file.id));
  const totals = { count: kept.length + files.length, bytes: [...kept, ...files].reduce((sum, file) => sum + file.size, 0) };
  const problem = pageFileTotalsProblem(totals);
  if (problem) return { ok: false, faults: [{ path: wholeSetFault, problem }] };
  return { ok: true, plan: { adds, replaces, removes, totals } };
}

/** One refusal that names every file at fault, written for the agent that sent the set. */
export function faultsMessage(lead: string, faults: readonly PageFileFault[]): string {
  return `${lead}\n${faults.map((fault) => `- ${fault.path}: ${fault.problem}`).join("\n")}`;
}

/** Runs `work` over `items`, at most `atOnce` at a time, and keeps the results in the items' order. */
export async function inBatches<Item, Result>(items: readonly Item[], atOnce: number, work: (item: Item) => Promise<Result>): Promise<Result[]> {
  const results: Result[] = [];
  for (let start = 0; start < items.length; start += atOnce) {
    results.push(...(await Promise.all(items.slice(start, start + atOnce).map(work))));
  }
  return results;
}
