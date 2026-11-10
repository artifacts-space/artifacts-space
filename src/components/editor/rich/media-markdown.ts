import { fileMediaUrl, isMediaWidth, mediaKinds, parseFileMediaUrl, type MediaKind } from "@/lib/files/media-rules";
import { isSafeHref } from "@/lib/link-policy";

/**
 * The Markdown form of a media block, both ways. A media block is Markdown
 * image syntax alone in its paragraph:
 *
 *   ![Alt text](/api/files/<id>#<options> "Caption")
 *
 * See markdown-dialect.md for the whole dialect. Pure, so the round trip is
 * tested without an editor.
 */

/** The node name for images, video, audio, PDFs, and files in a document. */
export const MEDIA_NODE = "media";

/** Everything a media block stores. Plain JSON, so the node is collab-safe. */
export interface MediaAttrs {
  /** `/api/files/<id>` for an upload, an external http(s) image URL, or "" while empty or uploading. */
  src: string;
  kind: MediaKind;
  /** Alt text for an image; the name shown for any other kind. */
  alt: string;
  caption: string;
  /** Percent of the text column, or null for the natural size. */
  width: number | null;
  /** The upload this block waits for, in this browser; null once it has a file. Never written to Markdown. */
  uploadId: string | null;
}

/** A media block with nothing in it yet: the slash menu inserts these. */
export function emptyMediaAttrs(kind: MediaKind = "image"): MediaAttrs {
  return { src: "", kind, alt: "", caption: "", width: null, uploadId: null };
}

/** True when `value` is one of the media kinds. */
export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && (mediaKinds as readonly string[]).includes(value);
}

function stringAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function widthAttr(value: unknown): number | null {
  return typeof value === "number" && isMediaWidth(value) ? value : null;
}

/** A node's attributes read defensively, as collaborators or old documents may send anything. */
export function readMediaAttrs(attrs: Record<string, unknown> = {}): MediaAttrs {
  const { kind } = attrs;
  return {
    src: stringAttr(attrs.src),
    kind: isMediaKind(kind) ? kind : "image",
    alt: stringAttr(attrs.alt),
    caption: stringAttr(attrs.caption),
    width: widthAttr(attrs.width),
    uploadId: stringAttr(attrs.uploadId) || null,
  };
}

/** The uploaded file a block shows, or null for an external image or an empty block. */
export function mediaFileId(attrs: Pick<MediaAttrs, "src">): string | null {
  return parseFileMediaUrl(attrs.src)?.fileId ?? null;
}

/** Text on one line, for alt text and captions. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Alt text with every character that could start Markdown syntax escaped. */
export function escapeMediaAlt(alt: string): string {
  return oneLine(alt).replace(/[\\`*_[\]<>~&!]/g, (character) => `\\${character}`);
}

/** A caption as a Markdown link title, in double quotes. */
export function escapeMediaTitle(caption: string): string {
  return oneLine(caption).replace(/[\\"]/g, (character) => `\\${character}`);
}

/** An external URL as a Markdown link target: in angle brackets when it has spaces or parentheses. */
function linkTarget(url: string): string | null {
  if (!/[\s()<>]/.test(url)) return url;
  return /[<>\n]/.test(url) ? null : `<${url}>`;
}

function mediaTarget(attrs: MediaAttrs): string | null {
  const file = parseFileMediaUrl(attrs.src);
  if (file) return fileMediaUrl({ fileId: file.fileId, kind: attrs.kind, width: attrs.width });
  return isSafeHref(attrs.src) ? linkTarget(attrs.src) : null;
}

/**
 * The Markdown for a media block. Empty while it has no file (still empty,
 * or still uploading), so a half-made block is never saved.
 */
export function renderMediaMarkdown(attrs: MediaAttrs): string {
  const target = attrs.src ? mediaTarget(attrs) : null;
  if (!target) return "";
  const caption = oneLine(attrs.caption);
  return `![${escapeMediaAlt(attrs.alt)}](${target}${caption ? ` "${escapeMediaTitle(caption)}"` : ""})`;
}

/**
 * The attributes for a Markdown image, or null when it is not a media
 * block: an upload's URL in the exact dialect form, or an external http(s)
 * image, which never loads (see markdown-view.tsx) but keeps its place.
 */
export function mediaAttrsFromImage(href: string, title: string | null, alt: string): MediaAttrs | null {
  const file = parseFileMediaUrl(href);
  const caption = title ?? "";
  if (file) return { src: `/api/files/${file.fileId}`, kind: file.kind, alt, caption, width: file.width, uploadId: null };
  if (!isSafeHref(href) || href.startsWith("mailto:")) return null;
  return { src: href, kind: "image", alt, caption, width: null, uploadId: null };
}

/** The parts of a marked token the media tokenizer reads. */
interface InlineToken {
  type?: string | undefined;
  href?: unknown;
  title?: unknown;
  text?: unknown;
  tokens?: unknown;
}

/** The token the media tokenizer gives marked; `attrs` rides along to parseMarkdown. */
export interface MediaToken {
  type: typeof MEDIA_NODE;
  raw: string;
  attrs: MediaAttrs;
}

const mediaLine = /^ {0,3}(!\[[^\n]*\)) *(?:\n|$)/;
const blankOrEnd = /^[ \t]*(?:\n|$)/;
const plainTextTypes: ReadonlySet<string> = new Set(["text", "escape"]);
/** An HTML character reference, which the read view decodes and the editor would not. */
const characterReference = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

/**
 * The alt text as plain text, or null when it has formatting (emphasis,
 * code, links) or character references that the read view would flatten
 * differently from the editor. Escaped characters count as themselves.
 */
function plainAlt(tokens: unknown): string | null {
  if (!Array.isArray(tokens)) return "";
  let alt = "";
  for (const token of tokens as InlineToken[]) {
    if (!plainTextTypes.has(token.type ?? "") || typeof token.text !== "string") return null;
    if (token.type === "text" && characterReference.test(token.text)) return null;
    alt += token.text;
  }
  return alt;
}

function imageOf(tokens: readonly InlineToken[]): { href: string; title: string | null; alt: string } | null {
  const [only] = tokens;
  if (tokens.length !== 1 || only?.type !== "image" || typeof only.href !== "string") return null;
  const alt = plainAlt(only.tokens);
  if (alt === null) return null;
  return { href: only.href, title: typeof only.title === "string" ? only.title : null, alt };
}

/**
 * Reads a media block at the start of `src`: one image alone on its line,
 * then a blank line or the end. Anything else (an image inside text, text
 * on the next line, alt text with formatting) is left to marked, so the
 * paragraph stays as written. `inlineTokens` is marked's inline lexer.
 */
export function tokenizeMediaBlock(src: string, inlineTokens: (text: string) => readonly InlineToken[]): MediaToken | undefined {
  const match = mediaLine.exec(src);
  const line = match?.[0];
  const image = match?.[1];
  if (line === undefined || image === undefined || !blankOrEnd.test(src.slice(line.length))) return undefined;
  const parsed = imageOf(inlineTokens(image));
  const attrs = parsed ? mediaAttrsFromImage(parsed.href, parsed.title, parsed.alt) : null;
  return attrs ? { type: MEDIA_NODE, raw: line, attrs } : undefined;
}
