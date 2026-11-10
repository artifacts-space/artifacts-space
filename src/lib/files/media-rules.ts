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

/**
 * How to show the file a Markdown media URL names: the kind its fragment
 * names, or, when it names none, the kind the file's type calls for, so
 * `![clip](/api/files/<id>)` for a video plays instead of drawing a broken
 * image. Null when `url` is not a media URL.
 */
export function shownMediaKind(url: string, contentType: string | null | undefined): MediaKind | null {
  const target = parseFileMediaUrl(url);
  if (!target) return null;
  const fragment = url.trim().split("#")[1] ?? "";
  if (fragment.split("&").some(isMediaKind) || !contentType) return target.kind;
  return mediaKindForType(contentType);
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

const fenceOpen = /^ {0,3}(`{3,}|~{3,})/;
const fenceClose = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?\n?$/;
const inlineCode = /(`+)[\s\S]*?[^`]\1(?!`)/g;

/** Runs `rewrite` on one line's text outside its inline code spans. */
function outsideInlineCode(line: string, rewrite: (text: string, lineStart: boolean) => string): string {
  let out = "";
  let last = 0;
  for (const match of line.matchAll(inlineCode)) {
    out += rewrite(line.slice(last, match.index), last === 0) + match[0];
    last = match.index + match[0].length;
  }
  return out + rewrite(line.slice(last), last === 0);
}

const blankLine = /^[ \t]*\r?\n?$/;
const quotePrefix = /^ {0,3}> ?/;
const listMarker = /^([-*+]|\d{1,9}[.)])([ \t]+|\r?\n?$)/;

/**
 * Where the line scan is: inside a fence or an indented code block, inside
 * a list item (and how far its content is indented), inside a block quote
 * (with its own scan of the quoted lines), and whether the last line was
 * blank.
 */
interface ScanState {
  fence: string | null;
  indentedCode: boolean;
  listIndent: number | null;
  afterBlank: boolean;
  /** A paragraph is open, so an indented line continues it rather than starting code. */
  paragraph: boolean;
  quote: ScanState | null;
}

/** A heading, a thematic break or a setext underline: no paragraph stays open after it. */
const closesParagraph = /^ {0,3}(?:#{1,6}(?:[ \t]|\r?\n?$)|([-*_])(?:[ \t]*\1){2,}[ \t]*\r?\n?$|(?:=+|-+)[ \t]*\r?\n?$)/u;

function freshScan(): ScanState {
  return { fence: null, indentedCode: false, listIndent: null, afterBlank: true, paragraph: false, quote: null };
}

/** True when `line` closes the open fence. */
function closesFence(line: string, fence: string): boolean {
  const close = fenceClose.exec(line)?.[1];
  return close?.startsWith(fence.charAt(0)) === true && close.length >= fence.length;
}

/** The line with tabs at its start counted as four spaces, and how many spaces it starts with. */
function leadingSpaces(line: string): { text: string; indent: number } {
  const text = line.replace(/^[ \t]+/u, (space) => space.replaceAll("\t", "    "));
  return { text, indent: text.length - text.trimStart().length };
}

/**
 * Whether `line` is code (in a fence or an indented code block), moving the
 * scan on. Block quotes are scanned on their own, without the `>`. In a list
 * item, indentation counts from where the item's content starts, so an
 * indented code block or fence inside a list item is code and the item's
 * own paragraphs are not. An indented line is code only where CommonMark
 * starts or continues an indented code block: anywhere but inside an open
 * paragraph, so after a blank line, a heading, a thematic break or a closed
 * fence, or right after more of the block.
 */
function isCodeLine(line: string, state: ScanState): boolean {
  if (state.fence !== null) {
    if (closesFence(relativeTo(line, state), state.fence)) state.fence = null;
    state.paragraph = false;
    return true;
  }
  const quote = quotePrefix.exec(line);
  if (quote) {
    state.quote ??= freshScan();
    state.afterBlank = false;
    // A line after the quote may be a lazy continuation of its paragraph, so it is never code.
    state.paragraph = true;
    return isCodeLine(line.slice(quote[0].length), state.quote);
  }
  state.quote = null;
  if (blankLine.test(line)) {
    state.afterBlank = true;
    state.paragraph = false;
    return false;
  }
  return scanLine(line, state);
}

/** The line as its list item's content sees it: without the item's content indent. */
function relativeTo(line: string, state: ScanState): string {
  const { text, indent } = leadingSpaces(line);
  return state.listIndent !== null && indent >= state.listIndent ? text.slice(state.listIndent) : text;
}

/** A non-blank line outside a fence and outside a quote. */
function scanLine(line: string, state: ScanState): boolean {
  const afterBlank = state.afterBlank;
  state.afterBlank = false;
  const { indent } = leadingSpaces(line);
  const base = state.listIndent ?? 0;
  if (indent >= base + 4) {
    state.indentedCode = !state.paragraph;
    return state.indentedCode;
  }
  state.indentedCode = false;
  // Out of the list: a line less indented than the item's content, after a blank line.
  if (state.listIndent !== null && afterBlank && indent < state.listIndent) state.listIndent = null;
  // A fence can open on the list marker's own line (`- ```bash`): test the item's content, after the marker.
  const content = startsListItem(line, state) ?? relativeTo(line, state);
  state.fence = fenceOpen.exec(content)?.[1] ?? null;
  state.paragraph = state.fence === null && leavesParagraphOpen(content);
  return state.fence !== null;
}

/** Whether a line of text (not code) leaves a paragraph open after it. */
function leavesParagraphOpen(content: string): boolean {
  return content.trim() !== "" && !closesParagraph.test(content);
}

/**
 * Starts a list item (or a nested one) when `line` begins with a list
 * marker, setting where its content starts, and returns that content; null
 * when the line starts no item.
 */
function startsListItem(line: string, state: ScanState): string | null {
  const { text, indent } = leadingSpaces(line);
  if (indent > (state.listIndent ?? 0) + 3) return null;
  const marker = listMarker.exec(text.slice(indent));
  if (!marker) return null;
  const gap = marker[2]?.replace(/\r?\n/u, "").length ?? 0;
  state.listIndent = indent + (marker[1]?.length ?? 1) + (gap >= 1 && gap <= 4 ? gap : 1);
  return text.slice(state.listIndent);
}

/**
 * Runs `rewrite` on the Markdown's text outside code (fenced and indented
 * blocks, and inline code), so a code sample that shows a file path stays
 * exactly as written. `lineStart` says the text starts its line, where a
 * reference definition can begin.
 */
function rewriteOutsideCode(markdown: string, rewrite: (text: string, lineStart: boolean) => string): string {
  const state = freshScan();
  return markdown
    .split(/(?<=\n)/)
    .map((line) => (isCodeLine(line, state) ? line : outsideInlineCode(line, rewrite)))
    .join("");
}

/** Rewrites the start of every link, image, and reference-definition target that `from` matches. */
function rewriteFileTargets(markdown: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inline = new RegExp(`(\\]\\(\\s*<?)${escaped}`, "giu");
  const definition = new RegExp(`^( {0,3}\\[[^\\]]+\\]:[ \\t]*<?)${escaped}`, "iu");
  return rewriteOutsideCode(markdown, (text, lineStart) => {
    const linked = text.replace(inline, `$1${to}`);
    return lineStart ? linked.replace(definition, `$1${to}`) : linked;
  });
}

/**
 * Makes `/api/files/<id>` link, image, and reference-definition targets
 * absolute, for the Markdown version, which is read outside the site. Only
 * targets change; code blocks and inline code stay as written.
 */
export function absoluteFileLinks(markdown: string, origin: string): string {
  return rewriteFileTargets(markdown, FILE_PATH_PREFIX, `${origin.replace(/\/+$/, "")}${FILE_PATH_PREFIX}`);
}

/**
 * The reverse of absoluteFileLinks, for saves: targets that name this
 * site's own files absolutely (`https://<site>/api/files/<id>`, as an agent
 * re-saving the Markdown version sends them) go back to the relative form
 * the editor and read view show as media. Other origins stay as written.
 */
export function relativeFileLinks(markdown: string, origin: string): string {
  const site = origin.replace(/\/+$/, "");
  if (!site || !markdown.toLowerCase().includes(`${site.toLowerCase()}${FILE_PATH_PREFIX}`)) return markdown;
  return rewriteFileTargets(markdown, `${site}${FILE_PATH_PREFIX}`, FILE_PATH_PREFIX);
}
