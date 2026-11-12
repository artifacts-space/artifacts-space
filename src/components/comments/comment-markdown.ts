import type { JSONContent } from "@tiptap/core";

import { parseMarkdown, serializeMarkdown, type CommentFlavor, type LoadedMarkdown, type SourceMap } from "@/components/editor/rich/markdown-roundtrip";

import { threadShows } from "./thread-reading";

/** A comment's Markdown, judged by how the comment thread renders it (thread-reading.ts). */
export const commentFlavor: CommentFlavor = { shows: threadShows };

/** Loads a comment's Markdown into the box; blocks the box would show differently from the thread stay as written. */
export function parseCommentMarkdown(markdown: string): LoadedMarkdown {
  return parseMarkdown(markdown, commentFlavor);
}

/**
 * The box's content as a comment's Markdown: untouched blocks exactly as
 * loaded, and every new or edited block in a form the thread shows as the
 * box did.
 */
export function serializeCommentMarkdown(doc: JSONContent, source: SourceMap): string {
  return serializeMarkdown(doc, source, commentFlavor);
}
