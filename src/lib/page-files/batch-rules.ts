import { formatBytes } from "@/lib/files/config";

import { suggestPagePath } from "./drop-rules";
import { heldAt, planPagePublish, repeatedPaths, wholeSetFault, type HeldPageFile } from "./publish-rules";
import { pageFileLimits, pagePathProblem } from "./rules";

/*
 * A person's set of page files on its way into an HTML artifact from the
 * web app: what is wrong with it, what it replaces, and what happens next.
 * The checks are the batch tools' own (planPagePublish); this names them
 * for the rows a person sees and decides when the set is published.
 *
 * Pure rules, safe for the server and the browser.
 */

/** One file of the set: its row's key, the path it would take, and its size. */
export interface BatchFile {
  key: string;
  path: string;
  size: number;
}

/** What is wrong with a set, and what it would do. */
export interface BatchReview {
  /** Why a file's path cannot be used yet, by row: the person fixes it in the row. */
  pathProblems: ReadonlyMap<string, string>;
  /** Why the set does not fit the page (its limits), or null. Known only once every path is fine. */
  setProblem: string | null;
  /** The held path each file takes the place of, by row. */
  replaces: ReadonlyMap<string, string>;
}

/** What a file whose path differs from a held one only by letter case is told. */
export function caseTwinProblem(heldPath: string): string {
  return `The page already has ${heldPath}. Paths that differ only by capital letters count as one. Use ${heldPath} to replace it, or another path.`;
}

/** What a file is told when another file of the same set has its path. */
export const repeatedPathProblem = "Another file here has this path. Give each file its own path.";

/** Why one file's path cannot be used: the path rules, a case twin of a held file, or a path another file of the set has too. */
function pathProblem(file: BatchFile, held: readonly HeldPageFile[], repeated: ReadonlySet<string>): string | null {
  const problem = pagePathProblem(file.path);
  if (problem) return problem;
  const at = heldAt(held, file.path);
  if (at && !at.exact) return caseTwinProblem(at.file.pagePath);
  return repeated.has(file.path.toLowerCase()) ? repeatedPathProblem : null;
}

/**
 * Checks a person's set against the page's files before anything is
 * published: each path, a case twin of a held path, a path named twice,
 * and, once every path is fine, the page's limits as the set would leave
 * it (planPagePublish, the same check the server makes). Says which held
 * file each new one replaces.
 */
export function reviewBatch(files: readonly BatchFile[], held: readonly HeldPageFile[]): BatchReview {
  const { pathProblems, replaces } = reviewEach(files, held);
  if (pathProblems.size > 0 || files.length === 0) return { pathProblems, setProblem: null, replaces };
  const check = planPagePublish(files, [], held);
  if (check.ok) return { pathProblems, setProblem: null, replaces };
  for (const fault of check.faults) {
    for (const file of files) if (file.path === fault.path) pathProblems.set(file.key, fault.problem);
  }
  return { pathProblems, setProblem: check.faults.find((fault) => fault.path === wholeSetFault)?.problem ?? null, replaces };
}

/** Each file on its own: why its path cannot be used, and which held file it replaces. */
function reviewEach(files: readonly BatchFile[], held: readonly HeldPageFile[]): { pathProblems: Map<string, string>; replaces: Map<string, string> } {
  const repeated = new Set(repeatedPaths(files.map((file) => file.path)).map((path) => path.toLowerCase()));
  const pathProblems = new Map<string, string>();
  const replaces = new Map<string, string>();
  for (const file of files) {
    const problem = pathProblem(file, held, repeated);
    const at = heldAt(held, file.path);
    if (problem) pathProblems.set(file.key, problem);
    else if (at?.exact) replaces.set(file.key, at.file.pagePath);
  }
  return { pathProblems, replaces };
}

/** `path` with `-<n>` before its extension: "img/logo.png" and 2 give "img/logo-2.png". */
function numbered(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const at = dot > slash + 1 ? dot : path.length;
  return `${path.slice(0, at)}-${String(n)}${path.slice(at)}`;
}

/**
 * The path a row offers in place of one that cannot be used, for the
 * person to take or change: the path cleaned (suggestPagePath); the held
 * file's own path when the cleaned one is a case twin of it, so the new
 * file replaces it; and, when another file of the set (`taken`, lowercase)
 * has it, the same with a number. Nothing takes it until the person does.
 */
export function pathSuggestion(path: string, held: readonly HeldPageFile[], taken: ReadonlySet<string>): string {
  const cleaned = suggestPagePath(path) || "file";
  const at = heldAt(held, cleaned);
  if (at) return at.file.pagePath;
  if (!taken.has(cleaned.toLowerCase())) return cleaned;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = numbered(cleaned, n);
    if (!taken.has(candidate.toLowerCase()) && !heldAt(held, candidate)) return candidate;
  }
  return cleaned;
}

/** Where one file's upload stands. */
export type BatchUploadState = "waiting" | "uploading" | "ready" | "failed";

/** What the set waits for, or does next. */
export type BatchStep =
  /** Nothing to publish. */
  | "empty"
  /** A path needs the person's fix. */
  | "fix"
  /** The set does not fit the page's limits: the person leaves files out. */
  | "too-many"
  /** An upload failed: the person tries again or leaves the file out. */
  | "failed"
  /** Uploads are on their way. */
  | "working"
  /** Every file is ready and some replace held files: the person says so first. */
  | "confirm"
  /** Every file is ready: publish. */
  | "publish";

/**
 * The next step of a set: its rows' uploads, the review, and whether the
 * person already said to replace (they chose Replace on a row, or pressed
 * the set's button). A set publishes by itself only when it replaces
 * nothing, so nothing is overwritten without the person seeing it first.
 */
export function batchStep(states: readonly BatchUploadState[], review: BatchReview, confirmed: boolean): BatchStep {
  if (states.length === 0) return "empty";
  if (review.pathProblems.size > 0) return "fix";
  if (review.setProblem) return "too-many";
  if (states.includes("failed")) return "failed";
  if (states.some((state) => state !== "ready")) return "working";
  return review.replaces.size > 0 && !confirmed ? "confirm" : "publish";
}

/** Splits keys into requests of at most `size` each, in order: one set asks in as few calls as the caps allow. */
export function inChunks<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += Math.max(1, size)) chunks.push(items.slice(start, start + Math.max(1, size)));
  return chunks;
}

function counted(count: number, one: string): string {
  return count === 1 ? `1 ${one}` : `${String(count)} ${one}s`;
}

/** The words on the set's button: what pressing it does. */
export function publishButtonWords(count: number, replacing: number): string {
  if (replacing === 0) return `Add ${counted(count, "file")}`;
  if (replacing === count) return `Replace ${counted(count, "file")}`;
  return `Add and replace ${counted(count, "file")}`;
}

/** What a publish did, for the person: added, replaced, removed, and whether it waits for approval. */
export function publishedWords(published: { added: readonly string[]; replaced: readonly string[]; removed: readonly string[]; status: "applied" | "pending" }): string {
  const parts: string[] = [];
  if (published.added.length > 0) parts.push(`Added ${counted(published.added.length, "file")} to the page.`);
  if (published.replaced.length === 1) parts.push(`Replaced ${published.replaced[0] ?? ""}. The old copy is in History.`);
  if (published.replaced.length > 1) parts.push(`Replaced ${counted(published.replaced.length, "file")}. The old copies are in History.`);
  if (published.removed.length > 0) parts.push(`Removed ${published.removed.length === 1 ? (published.removed[0] ?? "") : counted(published.removed.length, "file")}.`);
  if (published.status === "pending") parts.push("Readers outside the team see it once a team owner or admin approves it.");
  return parts.join(" ");
}

/** How much of the page's room its files use: "12 of 100 files, 1.4 MB of 16 MB". */
export function pageFilesTotalsWords(files: readonly { size: number }[]): string {
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  return `${String(files.length)} of ${String(pageFileLimits.maxFiles)} files, ${formatBytes(bytes)} of ${formatBytes(pageFileLimits.maxTotalBytes)}`;
}

/** Page files in the order the list shows them: the page's own folder first, then each folder in turn, by path. */
export function inPathOrder<T extends { pagePath?: string | undefined }>(files: readonly T[]): T[] {
  const depth = (file: T) => ((file.pagePath ?? "").includes("/") ? 1 : 0);
  return [...files].sort((a, b) => depth(a) - depth(b) || (a.pagePath ?? "").localeCompare(b.pagePath ?? ""));
}
