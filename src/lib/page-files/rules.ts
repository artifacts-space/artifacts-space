/*
 * Page files: the files of an HTML artifact that its page loads by a
 * relative path, as on any website (`<link href="css/site.css">`, a module's
 * `import "./chart.js"`, `url(img/bg.png)` in a stylesheet, `fetch("data.json")`).
 * A page file is an attached file with a page path (`artifact_file.page_path`).
 * The page host serves it under the page's own address
 * (src/lib/page-files/serve.ts); it is never served inline from this site.
 *
 * Pure rules, safe for the server and the browser.
 */

/** The limits on the page files of one artifact. */
export const pageFileLimits = {
  /** Most page files in one artifact. */
  maxFiles: 100,
  /** Largest total size of one artifact's page files, in bytes (16 MiB). */
  maxTotalBytes: 16 * 1024 * 1024,
  /** Longest path, in characters. */
  maxPathLength: 200,
  /** Most segments in a path: seven folders and the file's name. */
  maxDepth: 8,
} as const;

/** How a page file's bytes are checked when its upload is finished (src/lib/files/signature.ts). */
export type PageFileCheck = "text" | "woff2" | "woff" | "ttf" | "otf" | "wasm" | "stored";

/** One kind of page file: the type it is stored and served as, and a short name for people. */
export interface PageFileType {
  /** The content type the upload is stored with. */
  contentType: string;
  label: string;
  check: PageFileCheck;
}

const text = (contentType: string, label: string): PageFileType => ({ contentType, label, check: "text" });
/** A type plain attachments take too: checked as that type is (matchesFileSignature). */
const stored = (contentType: string, label: string): PageFileType => ({ contentType, label, check: "stored" });

/** What a page file may be, by the extension of its path. Anything else is refused. */
const typesByExtension: Readonly<Record<string, PageFileType>> = {
  css: text("text/css", "Stylesheet"),
  js: text("text/javascript", "Script"),
  mjs: text("text/javascript", "Script"),
  svg: text("image/svg+xml", "SVG image"),
  json: stored("application/json", "JSON"),
  map: stored("application/json", "Source map"),
  txt: stored("text/plain", "Text"),
  md: stored("text/plain", "Text"),
  csv: stored("text/csv", "CSV"),
  woff2: { contentType: "font/woff2", label: "Font", check: "woff2" },
  woff: { contentType: "font/woff", label: "Font", check: "woff" },
  ttf: { contentType: "font/ttf", label: "Font", check: "ttf" },
  otf: { contentType: "font/otf", label: "Font", check: "otf" },
  wasm: { contentType: "application/wasm", label: "WebAssembly module", check: "wasm" },
  png: stored("image/png", "PNG image"),
  jpg: stored("image/jpeg", "JPEG image"),
  jpeg: stored("image/jpeg", "JPEG image"),
  gif: stored("image/gif", "GIF image"),
  webp: stored("image/webp", "WebP image"),
  avif: stored("image/avif", "AVIF image"),
  mp4: stored("video/mp4", "MP4 video"),
  webm: stored("video/webm", "WebM video"),
  mp3: stored("audio/mpeg", "MP3 audio"),
  wav: stored("audio/wav", "WAV audio"),
};

/** Every kind of page file, for the docs: the extension, the type it is stored and served as, and its name for people. */
export const pageFileExtensions: readonly { extension: string; contentType: string; label: string }[] = Object.entries(typesByExtension).map(([extension, type]) => ({ extension, contentType: type.contentType, label: type.label }));

const typesByContentType = new Map(Object.values(typesByExtension).map((type) => [type.contentType, type]));

/** Every content type a page file is stored with. */
export const pageFileContentTypes: readonly string[] = [...typesByContentType.keys()];

/** The types a page file may be, as a short list for people and agents. */
export const pageFileTypesHint = "CSS, JavaScript (.js, .mjs), SVG, JSON, text, CSV, fonts (WOFF2, WOFF, TTF, OTF), WebAssembly, images, MP4, WebM, MP3, and WAV";

const segmentPattern = /^[A-Za-z0-9._-]+$/;

/** The lowercase extension of a path's last segment, or "". */
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase();
}

function segmentProblem(segment: string): string | null {
  if (segment === "") return "A page file's path has no empty part: no leading, trailing, or double slash.";
  if (segment === "." || segment === "..") return 'A page file\'s path cannot hold "." or "..". Name the file from the page\'s own folder, such as css/site.css.';
  if (!segmentPattern.test(segment)) return "A page file's path holds only letters, digits, dots, dashes, and underscores, with / between folders.";
  if (segment.startsWith(".")) return "A part of a page file's path cannot start with a dot.";
  return null;
}

/**
 * Why a path cannot name a page file, or null when it can. A path is
 * relative to the page: folders and a file name joined by `/`, each of
 * letters, digits, dots, dashes, and underscores. The page itself is
 * `index.html`, so no file takes that name, and a second HTML document is
 * refused: it would take the page's place in the frame, where the site
 * would close it.
 */
export function pagePathProblem(path: string): string | null {
  if (path.length === 0) return "Give the page file a path, such as css/site.css.";
  if (path.length > pageFileLimits.maxPathLength) return `A page file's path is at most ${String(pageFileLimits.maxPathLength)} characters.`;
  const segments = path.split("/");
  if (segments.length > pageFileLimits.maxDepth) return `A page file's path is at most ${String(pageFileLimits.maxDepth)} parts deep.`;
  for (const segment of segments) {
    const problem = segmentProblem(segment);
    if (problem) return problem;
  }
  const extension = extensionOf(path);
  if (extension === "html" || extension === "htm") return "A page file cannot be another HTML document: the page is the artifact's content, and one artifact is one page. Put the markup in the page, or make a second artifact.";
  if (!Object.hasOwn(typesByExtension, extension)) return `This file type cannot be a page file. Page files are ${pageFileTypesHint}.`;
  return null;
}

/** The type of the page file a path names, by its extension, or null when the path cannot name one. */
export function pageFileTypeFor(path: string): PageFileType | null {
  if (pagePathProblem(path) !== null) return null;
  return typesByExtension[extensionOf(path)] ?? null;
}

/** The page file type stored with this content type, or null when no page file is stored so. */
export function pageFileTypeOfStored(contentType: string): PageFileType | null {
  return typesByContentType.get(contentType) ?? null;
}

/** A short name for people for a page file's type, such as "Stylesheet". */
export function pageFileLabel(contentType: string): string {
  return pageFileTypeOfStored(contentType)?.label ?? "File";
}

const textTypes = new Set(["text/css", "text/javascript", "application/json", "text/plain", "text/csv", "image/svg+xml"]);

/** The Content-Type header a page file is served with: its stored type, as UTF-8 when it is text. */
export function servedContentType(contentType: string): string {
  return textTypes.has(contentType) ? `${contentType}; charset=utf-8` : contentType;
}

/** The last part of a page path: the file's own name. */
export function pageFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The outcome of checking a requested page file upload. */
export type PageUploadCheck = { ok: true; contentType: string } | { ok: false; error: string };

/**
 * Checks a page file's path before its upload starts. The type comes from
 * the path's extension alone, so a file's path always says what it is
 * served as; a declared type is not read.
 */
export function checkPagePath(path: string): PageUploadCheck {
  const problem = pagePathProblem(path);
  if (problem) return { ok: false, error: problem };
  const type = pageFileTypeFor(path);
  return type ? { ok: true, contentType: type.contentType } : { ok: false, error: `This file type cannot be a page file. Page files are ${pageFileTypesHint}.` };
}

/** What one artifact's page files add up to. */
export interface PageFileTotals {
  count: number;
  bytes: number;
}

function megabytes(bytes: number): string {
  return `${String(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
}

/** Why page files of these totals are too many or too large for one artifact, or null when they fit. */
export function pageFileTotalsProblem(totals: PageFileTotals): string | null {
  if (totals.count > pageFileLimits.maxFiles) return `A page holds at most ${String(pageFileLimits.maxFiles)} page files. Remove some first.`;
  if (totals.bytes > pageFileLimits.maxTotalBytes) {
    return `The page's files would add up to ${megabytes(totals.bytes)}. The limit is ${megabytes(pageFileLimits.maxTotalBytes)} for all the page files of one artifact.`;
  }
  return null;
}

/**
 * Whether an upload may take a file's place (files_replace): a page file is
 * replaced only by an upload requested for the same path, and a plain
 * attachment only by a plain upload. So a path never changes what it is
 * served as, and a page-only type never becomes a plain attachment.
 */
export function replacementPathProblem(target: { pagePath: string | null }, upload: { pagePath: string | null }): string | null {
  if (target.pagePath === upload.pagePath) return null;
  if (target.pagePath !== null) return `This is the page file ${target.pagePath}. Request the new upload with the same pagePath, then replace it.`;
  return "This upload was requested as a page file. Replace a plain attachment with an upload requested without pagePath.";
}

/**
 * Asks once, and once more when the call itself fails (a request that was
 * dropped on the way). An answer is final, a refusal included: only a
 * failed call is tried again, and only once.
 */
export async function askAgainOnFailure<T>(ask: () => Promise<T>): Promise<T> {
  try {
    return await ask();
  } catch {
    return ask();
  }
}
