import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/handles";

/**
 * Finds @handle mentions in a markdown comment body.
 *
 * - A mention starts at "@" that follows the start of the text or a character
 *   that cannot be part of a word, path, or email (so "a@b.com" and
 *   "site/@x" are not mentions, and "\@x" is escaped).
 * - The handle follows the username rules: lowercase letters, numbers, and
 *   single hyphens, starting and ending with a letter or number. Input is
 *   matched case-insensitively and returned lowercase.
 * - Fenced code blocks and inline code spans are skipped.
 * - Trailing punctuation ("@x.", "@x,", "@x)") ends the handle.
 * - Each handle is returned once, in order of first appearance.
 */
const fencedBlock = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]{0,3}\2[`~]*[ \t]*(?=\n|$)|$)/g;
const inlineCode = /(`+)[\s\S]*?\1/g;
const mentionPattern = /(?<![a-z0-9@./\\`-])@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?![a-z0-9@]|-[a-z0-9])/gi;

/** Removes code so mentions inside it never count. Keeps newlines so positions stay roughly stable. */
function stripCode(body: string) {
  return body.replace(fencedBlock, (match) => match.replace(/[^\n]/g, " ")).replace(inlineCode, (match) => " ".repeat(match.length));
}

function isHandleShape(handle: string) {
  return handle.length >= HANDLE_MIN_LENGTH && handle.length <= HANDLE_MAX_LENGTH && !handle.includes("--");
}

/** The distinct handles mentioned in a comment body, lowercase, in order. */
export function parseMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of stripCode(body).matchAll(mentionPattern)) {
    const handle = match[1]?.toLowerCase();
    if (handle && isHandleShape(handle)) found.add(handle);
  }
  return [...found];
}

/** Who a mention points at. */
export type MentionKind = "person" | "agent";

/** A handle in a comment that reached a real person or agent. */
export interface ResolvedMention {
  handle: string;
  kind: MentionKind;
}

/** A piece of comment text: plain text, or a mention that resolved. */
export type MentionSegment = { type: "text"; value: string } | { type: "mention"; value: string; handle: string; kind: MentionKind };

/**
 * Splits plain text into text and resolved-mention segments, for highlighting.
 * Uses the same handle rules as parseMentions. Handles not in `resolved` stay
 * text. The output only labels slices of the input; it never adds markup.
 */
export function splitMentions(text: string, resolved: ReadonlyMap<string, MentionKind>): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(mentionPattern)) {
    const handle = match[1]?.toLowerCase() ?? "";
    const kind = resolved.get(handle);
    if (!kind || !isHandleShape(handle)) continue;
    if (match.index > cursor) segments.push({ type: "text", value: text.slice(cursor, match.index) });
    segments.push({ type: "mention", value: match[0], handle, kind });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}

/**
 * The handles a posted comment highlights: the mentions it delivered, plus
 * the author's own handle. Mentioning yourself notifies no one, so no mention
 * is stored, but the handle names a real member and shows as a chip. Unknown
 * or refused handles stay plain text.
 */
export function postedMentionMap(delivered: readonly ResolvedMention[], author: { handle: string | null; kind: MentionKind } | null): Map<string, MentionKind> {
  const map = new Map(delivered.map((item) => [item.handle, item.kind]));
  if (author?.handle && !map.has(author.handle)) map.set(author.handle, author.kind);
  return map;
}
