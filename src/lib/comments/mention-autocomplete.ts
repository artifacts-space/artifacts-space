import { HANDLE_MAX_LENGTH } from "@/lib/handles";

import type { MentionKind } from "./mentions";

/** Someone the writer can mention on this artifact, as the composer lists them. */
export interface Mentionable {
  /** Seeds the suggestion's pixel avatar. */
  userId: string;
  handle: string;
  name: string;
  kind: MentionKind;
}

/** The "@" being typed at the caret: where it starts and the letters after it. */
export interface MentionQuery {
  /** Index of the "@" in the text. */
  start: number;
  /** Lowercase letters typed after "@". May be empty. */
  query: string;
}

export const MENTION_SUGGESTION_LIMIT = 6;

// Same boundary rule as parseMentions: "@" after the start or a character that cannot be part of a word, path, or email.
const typingMention = new RegExp(`(?:^|[^a-z0-9@./\\\\\`-])@([a-z0-9-]{0,${String(HANDLE_MAX_LENGTH)}})$`, "i");
const handleTail = /^[a-z0-9-]*/i;

/** The mention being typed right before the caret, or null when the caret is not in one. */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const match = typingMention.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, query: query.toLowerCase() };
}

function rank(candidate: Mentionable, query: string): number | null {
  if (!query || candidate.handle.startsWith(query)) return 0;
  const words = candidate.name.toLowerCase().split(/\s+/);
  if (words.some((word) => word.startsWith(query))) return 1;
  return candidate.handle.includes(query) ? 2 : null;
}

/**
 * Candidates that match the typed letters, best first: handle prefix, then a
 * word of the name, then anywhere in the handle. Ties sort by handle.
 */
export function matchMentionables(candidates: readonly Mentionable[], query: string, limit = MENTION_SUGGESTION_LIMIT): Mentionable[] {
  const scored: { candidate: Mentionable; score: number }[] = [];
  for (const candidate of candidates) {
    const score = rank(candidate, query);
    if (score !== null) scored.push({ candidate, score });
  }
  scored.sort((a, b) => a.score - b.score || a.candidate.handle.localeCompare(b.candidate.handle));
  return scored.slice(0, limit).map((item) => item.candidate);
}

/**
 * Replaces the "@" being typed (and the rest of that handle after the caret)
 * with "@handle ", and returns the new text and caret. An existing space after
 * the handle is reused, and punctuation right after it ("@x,") gets no space.
 */
export function insertMention(text: string, mention: MentionQuery, caret: number, handle: string): { text: string; caret: number } {
  const tail = handleTail.exec(text.slice(caret))?.[0] ?? "";
  const after = text.slice(caret + tail.length);
  const inserted = `${text.slice(0, mention.start)}@${handle}`;
  if (after === "") return { text: `${inserted} `, caret: inserted.length + 1 };
  const nextCaret = /^\s/.test(after) ? inserted.length + 1 : inserted.length;
  return { text: inserted + after, caret: nextCaret };
}
