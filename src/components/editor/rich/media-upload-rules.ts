import { checkUpload, resolveFileType } from "@/lib/files/config";
import { mediaKindForType, type MediaKind } from "@/lib/files/media-rules";
import { safeHref } from "@/lib/link-policy";

/**
 * Decisions for files dropped, pasted, or picked into a document. Pure, so
 * they are tested without a browser; media-uploads.ts does the work. The
 * server checks every upload again: these only give a quick, clear answer.
 */

/** Most files one paste or drop adds at once. */
export const maxFilesPerInsert = 10;

/** Why this file cannot go into a document, written for the person, or null when it can. */
export function mediaUploadProblem(file: { name: string; type: string; size: number }): string | null {
  const check = checkUpload({ filename: file.name, contentType: file.type, size: file.size });
  return check.ok ? null : check.error;
}

/** How a picked or dropped file shows once it is uploaded, from its type or, failing that, its name. */
export function uploadMediaKind(file: { name: string; type: string }): MediaKind {
  return mediaKindForType(resolveFileType(file.name, file.type) ?? "");
}

/**
 * The name shown for a new block: nothing for images and video, so people
 * write real alt text instead of a camera file name; the file name for
 * audio, PDFs, and files, which show it on their card.
 */
export function defaultMediaLabel(kind: MediaKind, filename: string): string {
  return kind === "image" || kind === "video" ? "" : filename;
}

/** The files in a paste or drop that should become media blocks, capped at maxFilesPerInsert. */
export function insertableFiles(files: readonly File[]): File[] {
  return files.filter((file) => file.size > 0).slice(0, maxFilesPerInsert);
}

/** A file name for an image fetched from a link: the last part of its path, or "image". */
export function filenameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const name = decodeURIComponent(last).replace(/[^\w.\- ]+/g, "").trim();
    return name.slice(0, 120) || "image";
  } catch {
    return "image";
  }
}

/** The web address someone pasted to fetch a file from, or null when it is not an http(s) link. */
export function fetchableUrl(input: string): string | null {
  const safe = safeHref(input.trim());
  return safe?.startsWith("http") ? safe : null;
}

/** An HTML clipboard that holds only an image, as browsers write when you copy an image. */
const imageOnlyHtml = /^\s*(?:<meta[^>]*>\s*)?(?:<html>\s*<body>\s*)?(?:<!--StartFragment-->\s*)?<img\b[^>]*>\s*(?:<!--EndFragment-->\s*)?(?:<\/body>\s*<\/html>\s*)?$/i;

/**
 * True when a paste should upload its files rather than insert its text. A
 * copied image or screenshot comes as a file; a copy from a spreadsheet or
 * a word processor comes as text with a picture of it attached, and the text
 * is what people want.
 */
export function pasteIsFiles(paste: { fileNames: readonly string[]; text: string; html: string }): boolean {
  if (paste.fileNames.length === 0) return false;
  const text = paste.text.trim();
  // A file copied in a file manager comes with its name, or names, as the text.
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines.every((line) => paste.fileNames.includes(line.trim()))) return true;
  if (!text && !paste.html.trim()) return true;
  return !text && imageOnlyHtml.test(paste.html);
}
