import { MENTION_BLOCK_MAX } from "./config";
import { parseMentions, splitMentions, stripCode } from "./mentions";

/**
 * Pure rules for a mention in a document's own text: `@handle` typed into a
 * Markdown artifact, the same plain text a comment's mention is, so the
 * Markdown an agent reads and the page a person reads agree on it.
 * document-mentions.ts gathers the facts and applies these.
 */

/** The handles `after` names that `before` did not: the mentions this save added. */
export function addedMentions(before: string | null, after: string): Set<string> {
  const had = new Set(before === null ? [] : parseMentions(before));
  return new Set(parseMentions(after).filter((handle) => !had.has(handle)));
}

/** What a save does about one person or agent the document names and a mention can reach. */
export type DocumentMentionStep = "notify" | "notify_again" | "keep";

/**
 * A recipient hears of an artifact's text once: the first time a save finds
 * their handle in it while they can read it, whoever typed it and whenever
 * (so a private draft's mentions land when it is shared and saved). After
 * that, only a save that adds their handle anew, once they have read the
 * earlier notification, tells them again; an autosave that merely keeps the
 * handle never does.
 */
export function documentMentionStep(input: { stored: { read: boolean } | null; added: boolean }): DocumentMentionStep {
  if (!input.stored) return "notify";
  return input.added && input.stored.read ? "notify_again" : "keep";
}

const listItem = /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/;
const heading = /^[ \t]{0,3}#{1,6}[ \t]/;
const blank = /^[ \t]*$/;

/** A line that starts a block of its own, so the text around a mention stops there. */
function startsBlock(line: string): boolean {
  return listItem.test(line) || heading.test(line);
}

/** A line a block cannot run past: none, a blank one, or (going down) one that starts a block of its own. */
function ends(line: string | undefined, down: boolean): boolean {
  return line === undefined || blank.test(line) || (down && startsBlock(line));
}

/** The first and last line of the block around line `at`: a list item or heading alone, else the paragraph. */
function blockBounds(lines: readonly string[], at: number): [number, number] {
  // A heading is one line, whatever follows it.
  if (heading.test(lines[at] ?? "")) return [at, at];
  let first = at;
  while (!startsBlock(lines[first] ?? "") && !ends(lines[first - 1], false)) first -= 1;
  let last = at;
  while (!ends(lines[last + 1], true)) last += 1;
  return [first, last];
}

/** Where the document first mentions the handle outside code, as an offset into it; -1 when it does not. */
function mentionOffset(content: string, handle: string): number {
  // stripCode blanks code without changing any offset, so a place found in it is the same place in the document.
  let offset = 0;
  for (const segment of splitMentions(stripCode(content), new Map([[handle, "person"]]))) {
    if (segment.type === "mention") return offset;
    offset += segment.value.length;
  }
  return -1;
}

/**
 * The block of the document that mentions `handle`, as its Markdown: the
 * first paragraph, list item, or heading that names it outside code. Null
 * when the text no longer mentions them, which is how a removed mention's
 * notification drops out. Cut at MENTION_BLOCK_MAX characters.
 */
export function mentionBlock(content: string, handle: string): string | null {
  const offset = mentionOffset(content, handle);
  if (offset < 0) return null;
  const lines = content.split("\n");
  const at = content.slice(0, offset).split("\n").length - 1;
  const [first, last] = blockBounds(lines, at);
  const block = lines.slice(first, last + 1).join("\n").trim();
  return block.length > MENTION_BLOCK_MAX ? `${block.slice(0, MENTION_BLOCK_MAX - 1).trimEnd()}…` : block;
}
