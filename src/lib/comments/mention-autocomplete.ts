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
  const edit = mentionReplacement(text, mention, caret, handle);
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), caret: edit.caret };
}

/** One edit that puts a picked mention in the text: replace `from`..`to` with `insert`, then put the caret at `caret`. */
export interface MentionEdit {
  from: number;
  to: number;
  insert: string;
  caret: number;
}

/**
 * The smallest edit insertMention makes, for editors that apply changes as
 * steps rather than replacing the whole text (the rich comment box). Same
 * rules: the rest of the handle after the caret goes, a space follows when
 * nothing does, and an existing space is stepped over.
 */
export function mentionReplacement(text: string, mention: MentionQuery, caret: number, handle: string): MentionEdit {
  const tail = handleTail.exec(text.slice(caret))?.[0] ?? "";
  const to = caret + tail.length;
  const after = text.slice(to);
  const insert = after === "" ? `@${handle} ` : `@${handle}`;
  const end = mention.start + `@${handle}`.length;
  const nextCaret = after === "" || /^\s/.test(after) ? end + 1 : end;
  return { from: mention.start, to, insert, caret: nextCaret };
}

/** Who the viewer can mention on an artifact, and the viewer themself. */
export interface MentionDirectory {
  candidates: Mentionable[];
  /** The viewer, when they have a handle. Never suggested, but highlighted. */
  self: Mentionable | null;
}

/**
 * The handles the composer highlights as mentions: everyone a mention would
 * reach, plus the writer's own handle. A self-mention notifies no one, but it
 * names a real member, so it shows as a chip like the posted comment does.
 */
export function composerMentionMap(directory: MentionDirectory): Map<string, MentionKind> {
  const map = new Map(directory.candidates.map((candidate) => [candidate.handle, candidate.kind]));
  if (directory.self) map.set(directory.self.handle, directory.self.kind);
  return map;
}
