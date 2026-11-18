import { checkUpload, fileExtension } from "@/lib/files/config";

import { pageFileSizeProblem } from "./publish-rules";
import { pageFileExtensions, pagePathProblem } from "./rules";

/*
 * What a person's drop (or pick) of files on an HTML artifact's page turns
 * into, decided from each file's name, size, and place in the drop: a page
 * file at a path, a plain attachment, the page itself (index.html), a file
 * that is refused with a reason, or a hidden or system file that is left
 * out. Every rule about what a page file may be is in rules.ts and
 * publish-rules.ts; this only routes files to them.
 *
 * Pure rules, safe for the server and the browser.
 */

/** One file of a drop, as the browser hands it over. */
export interface DroppedEntry {
  name: string;
  size: number;
  /** The declared type, used only for plain attachments: a page file's type comes from its path. */
  type: string;
  /** Where the file sits in the drop: "site/css/site.css" inside a dropped folder, or its own name. */
  relativePath: string;
  /** True when the file came out of a folder the person dropped or picked, not by itself. */
  fromFolder: boolean;
}

/** Where one file of a drop goes. */
export type DropRoute =
  | { kind: "page"; path: string }
  | { kind: "attachment" }
  | { kind: "page-html"; path: string }
  | { kind: "refused"; problem: string }
  | { kind: "left-out" };

/** Names of files that operating systems write beside a person's own files. */
const systemNames = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
/** Folders that only an archive tool or a system makes. */
const systemFolders = new Set(["__macosx"]);

const pageExtensions = new Set(pageFileExtensions.map((entry) => entry.extension));

/** What a person reads when a file they dropped is empty. */
export const emptyFileProblem = "The file is empty. Choose a file with content.";

/**
 * True for a file that is left out of a drop without a word of its own: a
 * system file (.DS_Store, Thumbs.db, desktop.ini, anything under __MACOSX),
 * and, inside a dropped folder, a hidden file or a file in a hidden folder
 * (a part that starts with a dot, such as .git or .env). A hidden file the
 * person dropped by itself is theirs to keep: it gets a path to fix.
 */
export function leftOutOfDrop(entry: Pick<DroppedEntry, "relativePath" | "fromFolder">): boolean {
  const parts = entry.relativePath.split("/");
  const name = (parts.at(-1) ?? "").toLowerCase();
  if (systemNames.has(name) || parts.some((part) => systemFolders.has(part.toLowerCase()))) return true;
  return entry.fromFolder && parts.some((part) => part.startsWith("."));
}

/**
 * The page paths of a drop's files, in order. When everything in the drop
 * sits under one folder (the person dropped or picked `site/`), that folder
 * is the page's own folder and is left out of the paths: `site/css/site.css`
 * becomes `css/site.css`. Otherwise each file keeps its place, so dropping
 * the folders `css/` and `img/` together keeps both names.
 */
export function pathsInDrop(relativePaths: readonly string[]): string[] {
  const tops = new Set(relativePaths.map((path) => (path.includes("/") ? path.slice(0, path.indexOf("/")) : null)));
  const [only] = tops;
  if (tops.size !== 1 || only === null || only === undefined) return [...relativePaths];
  return relativePaths.map((path) => path.slice(only.length + 1));
}

/** One part of a path, cleaned: lowercase, white space to dashes, any other character a path cannot hold to a dash, and no leading dot. */
function cleanSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^\.+/, "");
}

/**
 * A path the page can take, made from one it cannot: each part lowercase,
 * white space and other characters a path cannot hold turned into dashes,
 * leading dots dropped, and empty, `.`, and `..` parts left out. The person
 * sees it in the row before anything is added. Empty when nothing is left.
 */
export function suggestPagePath(path: string): string {
  return path
    .split("/")
    .map(cleanSegment)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

function isHtmlName(name: string): boolean {
  const extension = fileExtension(name);
  return extension === "html" || extension === "htm";
}

/** The words for an HTML file that is not the page itself: the rule's own reason. */
function htmlRefusal(path: string): string {
  return pagePathProblem(suggestPagePath(path) || "page.html") ?? "A page file cannot be another HTML document.";
}

/** Why a file of this size cannot be a page file, in a person's words, or null when it can. */
function sizeRefusal(size: number): string | null {
  return size <= 0 ? emptyFileProblem : pageFileSizeProblem(size);
}

/** Where a page-file type goes once its path is known: refused when its size cannot be a page file. */
function pageRoute(entry: DroppedEntry, path: string): DropRoute {
  const problem = sizeRefusal(entry.size);
  return problem ? { kind: "refused", problem } : { kind: "page", path };
}

/** Where a file that is no page-file type goes: a plain attachment when the site takes its type, refused otherwise. */
function plainRoute(entry: DroppedEntry): DropRoute {
  const check = checkUpload({ filename: entry.name, contentType: entry.type, size: entry.size });
  return check.ok ? { kind: "attachment" } : { kind: "refused", problem: check.error };
}

/**
 * Where each file of a drop on an HTML artifact goes, in order. A type
 * that can be a page file (rules.ts) becomes a page file at its path in the
 * drop, even when that path still needs fixing; any other type the site
 * takes is a plain attachment, as on every other format; the rest are
 * refused with the reason. An `index.html` at the top of the drop, when it
 * is the only one there, is the page itself; any other HTML file is
 * refused, since one artifact is one page. Hidden and system files are
 * left out (leftOutOfDrop).
 */
export function routeDrop(entries: readonly DroppedEntry[]): DropRoute[] {
  const paths = pathsInDrop(entries.map((entry) => entry.relativePath));
  const pageAt = paths.filter((path) => path.toLowerCase() === "index.html").length === 1;
  return entries.map((entry, index): DropRoute => {
    const path = paths[index] ?? entry.name;
    if (leftOutOfDrop(entry)) return { kind: "left-out" };
    if (isHtmlName(entry.name)) return pageAt && path.toLowerCase() === "index.html" ? { kind: "page-html", path } : { kind: "refused", problem: htmlRefusal(path) };
    if (pageExtensions.has(fileExtension(entry.name))) return pageRoute(entry, path);
    return plainRoute(entry);
  });
}

/** The quiet line for files left out of a drop, or null when none was. */
export function leftOutWords(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "Left out 1 hidden or system file." : `Left out ${String(count)} hidden or system files.`;
}

/**
 * Why a picked file cannot replace the page file at `path`, or null when it
 * can. The new file is stored at the same path, so it must be of the type
 * that path is served as: its extension must give the same type. An empty
 * file, or one over the limit, is refused as in a drop.
 */
export function replacementPickProblem(path: string, picked: { name: string; size: number }): string | null {
  const sizeProblem = sizeRefusal(picked.size);
  if (sizeProblem) return sizeProblem;
  const wanted = pageFileExtensions.find((entry) => entry.extension === fileExtension(path));
  const given = pageFileExtensions.find((entry) => entry.extension === fileExtension(picked.name));
  if (wanted && given?.contentType === wanted.contentType) return null;
  return `Pick a file of the same type (${wanted?.label ?? "page file"}) to replace ${path}, so the page keeps loading it from the same path.`;
}
