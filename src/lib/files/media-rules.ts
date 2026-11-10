import { fileCategory } from "./config";

/**
 * Uploaded files shown inside Markdown: the URL form that names a file and
 * how to show it, and the file ids a document points at. Pure and
 * client-safe, so the editor, the read view, the Markdown version, and the
 * server all read one rule. The dialect is written down in
 * src/components/editor/rich/markdown-dialect.md.
 */

/** How an uploaded file shows in a document. `image` is the default and is never written. */
export const mediaKinds = ["image", "video", "audio", "pdf", "file"] as const;
export type MediaKind = (typeof mediaKinds)[number];

/** Narrowest and widest a media block may be, in percent of the text column. */
export const mediaWidthRange = { min: 10, max: 100 } as const;

/** The path every uploaded file is served from; the route checks access on each request. */
export const FILE_PATH_PREFIX = "/api/files/";

const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const fileMediaPattern = new RegExp(`^/api/files/(${uuidPattern})(?:#(.*))?$`);
const fileRefPattern = new RegExp(`/api/files/(${uuidPattern})`, "g");
const fileLinkPattern = new RegExp(`^/api/files/${uuidPattern}(?:\\?download=1)?(?:#[^\\s]*)?$`);
const widthOption = /^width=(\d{1,3})$/;
const kindSet: ReadonlySet<string> = new Set(mediaKinds);

/** A file named by a Markdown media URL, with how to show it. */
export interface FileMediaTarget {
  /** The file id, lowercased. */
  fileId: string;
  kind: MediaKind;
  /** Percent of the text column, or null for the file's own size (never wider than the column). */
  width: number | null;
}

function isMediaKind(value: string): value is MediaKind {
  return kindSet.has(value);
}

/** True when `width` is a whole percent the dialect allows. */
export function isMediaWidth(width: number): boolean {
  return Number.isInteger(width) && width >= mediaWidthRange.min && width <= mediaWidthRange.max;
}

interface Options {
  kind: MediaKind | null;
  width: number | null;
}

/** Reads one `&`-joined option into `options`; false when it is unknown, repeated, or out of range. */
function readOption(option: string, options: Options): boolean {
  if (isMediaKind(option)) {
    if (options.kind !== null) return false;
    options.kind = option;
    return true;
  }
  const match = widthOption.exec(option);
  const width = Number(match?.[1]);
  if (!match || options.width !== null || !isMediaWidth(width)) return false;
  options.width = width;
  return true;
}

/** The fragment's options, or null when any part of it is not part of the dialect. */
function parseOptions(fragment: string | undefined): Options | null {
  const options: Options = { kind: null, width: null };
  if (fragment === undefined) return options;
  const parts = fragment.split("&");
  return parts.every((part) => readOption(part, options)) ? options : null;
}

/**
 * The file and display options in a Markdown media URL such as
 * `/api/files/<id>#video&width=60`, or null when `url` is not exactly that
 * form (another path, a query string, an unknown option). Strict on purpose:
 * anything else stays as written in the editor instead of being rewritten.
 */
export function parseFileMediaUrl(url: string): FileMediaTarget | null {
  const match = fileMediaPattern.exec(url.trim());
  const fileId = match?.[1];
  if (!match || !fileId) return null;
  const options = parseOptions(match[2]);
  if (!options) return null;
  return { fileId: fileId.toLowerCase(), kind: options.kind ?? "image", width: options.width };
}

/** True when `url` is a Markdown media URL for an uploaded file. */
export function isFileMediaUrl(url: string): boolean {
  return parseFileMediaUrl(url) !== null;
}

/** True when `url` is a link to an uploaded file on this site (`/api/files/<id>`, optionally `?download=1`). */
export function isFileLinkPath(url: string): boolean {
  return fileLinkPattern.test(url);
}

/** The canonical Markdown media URL: the kind (left out for images), then the width. */
export function fileMediaUrl(target: FileMediaTarget): string {
  const options = [target.kind === "image" ? null : target.kind, target.width === null ? null : `width=${String(target.width)}`].filter((option) => option !== null);
  const fragment = options.length > 0 ? `#${options.join("&")}` : "";
  return `${FILE_PATH_PREFIX}${target.fileId}${fragment}`;
}

/**
 * Every uploaded file a Markdown document points at, through media or
 * plain links: each `/api/files/<id>` in the text, lowercased, once. A plain
 * text match, so it errs on counting a file as used.
 */
export function markdownFileRefs(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(fileRefPattern)) {
    const id = match[1];
    if (id) ids.add(id.toLowerCase());
  }
  return [...ids];
}

/** How an upload of this content type shows in a document. */
export function mediaKindForType(contentType: string): MediaKind {
  const category = fileCategory(contentType);
  if (category === "image" || category === "video" || category === "audio" || category === "pdf") return category;
  return "file";
}

/** A dragged width as a whole percent within the allowed range. */
export function clampMediaWidth(percent: number): number {
  if (!Number.isFinite(percent)) return mediaWidthRange.max;
  return Math.min(mediaWidthRange.max, Math.max(mediaWidthRange.min, Math.round(percent)));
}

/** True for kinds whose width can be set; audio players and file cards always span the column. */
export function hasAdjustableWidth(kind: MediaKind): boolean {
  return kind === "image" || kind === "video";
}

/**
 * Makes `/api/files/<id>` link and image targets absolute, for the Markdown
 * version, which is read outside the site. Only link targets change.
 */
export function absoluteFileLinks(markdown: string, origin: string): string {
  return markdown.replace(/(\]\(\s*<?)\/api\/files\//g, `$1${origin.replace(/\/+$/, "")}${FILE_PATH_PREFIX}`);
}
