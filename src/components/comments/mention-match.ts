import type { Range } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";

import { activeMentionQuery, mentionReplacement, type MentionEdit, type MentionQuery } from "@/lib/comments/mention-autocomplete";

/*
 * The comment box's @mentions in a ProseMirror document. The rules are the
 * plain-text ones the server and the old textarea used
 * (src/lib/comments/mention-autocomplete.ts), applied to the text of the
 * line the cursor is in. Inline leaves (a line break) count as one
 * character, so offsets in that text are offsets in the document.
 */

/** Stands in for an inline leaf such as a hard break: one character, never part of a handle. */
const LEAF = "￼";

/** The "@" being typed before the cursor, with its document range and the line's text around it. */
export interface MentionMatch {
  range: Range;
  query: MentionQuery;
  /** The cursor's offset in `text`. */
  caret: number;
  /** The whole line's text. */
  text: string;
  /** Where the line's text starts in the document. */
  start: number;
}

/** The mention being typed at a cursor, or null outside one and in code. */
export function mentionMatchAt($position: ResolvedPos): MentionMatch | null {
  const parent = $position.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($position.marks().some((mark) => mark.type.spec.code)) return null;
  const text = parent.textBetween(0, parent.content.size, undefined, LEAF);
  const caret = $position.parentOffset;
  const query = activeMentionQuery(text.slice(0, caret), caret);
  if (!query) return null;
  const start = $position.start();
  return { range: { from: start + query.start, to: $position.pos }, query, caret, text, start };
}

/** The document edit that puts a picked handle where `match` is: positions, text, and where the cursor goes. */
export function mentionEditAt(match: MentionMatch, handle: string): MentionEdit {
  const edit = mentionReplacement(match.text, match.query, match.caret, handle);
  return { from: match.start + edit.from, to: match.start + edit.to, insert: edit.insert, caret: match.start + edit.caret };
}
