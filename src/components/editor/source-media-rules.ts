import { mediaKindForType } from "@/lib/files/media-rules";

import { emptyMediaAttrs, renderMediaMarkdown } from "./rich/media-markdown";
import { defaultMediaLabel } from "./rich/media-upload-rules";

/**
 * A file dropped on a document's source (View source) becomes the line of
 * Markdown the document's own editor would write for it, in a paragraph of
 * its own. Pure, so the text edits are tested without a browser;
 * source-file-drop.tsx uploads the file and makes the edit.
 */

/** The Markdown line that shows an uploaded file in a document, as its editor writes a new block for it. */
export function mediaLineFor(file: { id: string; filename: string; contentType: string }): string {
  const kind = mediaKindForType(file.contentType);
  return renderMediaMarkdown({ ...emptyMediaAttrs(kind), src: `/api/files/${file.id}`, alt: defaultMediaLabel(kind, file.filename) });
}

/** Where the source text of line `line` (from 0) starts; the end of the text for a line past the last. */
export function offsetOfLine(text: string, line: number): number {
  let offset = 0;
  for (let index = 0; index < line; index += 1) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

/** One edit of the source: put `insert` at `at`. Afterwards the cursor belongs at `caret`, the end of the new line, so the next file lands after this one. */
export interface SourceInsert {
  at: number;
  insert: string;
  caret: number;
}

/**
 * The edit that puts `line` into `text` as a paragraph of its own, at the
 * line the cursor is on: after that line when it has text, in its place
 * when it is blank. Blank lines are added only where they are missing, so
 * the line is alone in its paragraph (a media block must be) and the text
 * around it keeps its own spacing.
 */
export function ownParagraphInsert(text: string, offset: number, line: string): SourceInsert {
  const from = Math.min(Math.max(offset, 0), text.length);
  // A search from before the start would look at the first character, so the first line starts at 0 by rule.
  const lineStart = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = text.indexOf("\n", from);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const at = text.slice(lineStart, lineEnd).trim() === "" ? lineStart : lineEnd;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = gapBefore(before);
  return { at, insert: `${lead}${line}${gapAfter(after)}`, caret: at + lead.length + line.length };
}

/** The line breaks needed so what comes before ends its paragraph. */
function gapBefore(before: string): string {
  if (before.trim() === "") return "";
  if (before.endsWith("\n\n")) return "";
  return before.endsWith("\n") ? "\n" : "\n\n";
}

/** The line breaks needed so what comes after starts a new paragraph. */
function gapAfter(after: string): string {
  if (after.trim() === "") return after === "" ? "\n" : "";
  if (after.startsWith("\n\n")) return "";
  return after.startsWith("\n") ? "\n" : "\n\n";
}
