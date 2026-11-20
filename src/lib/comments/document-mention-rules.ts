import { MENTION_BLOCK_MAX } from "./config";
import { parseMentions, splitMentions, stripCode } from "./mentions";
import { mentionRefusal, type AuthorKind, type MentionCandidate } from "./rules";

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

/**
 * What a document's @handle does, as its writer is told after the save:
 * `reaches` (told once, when the text they are served names them), `later`
 * (the author or a teammate who cannot read the artifact yet: told once it
 * is shared with them), or `none`. The decision is the save's own
 * (document-mentions.ts): mentionRefusal, with an agent's save never
 * reaching agents and a muted agent reaching nobody.
 */
export type DocumentMentionReach = "reaches" | "later" | "none";

/** Why a document's @handle reaches nobody. `unknown` covers people outside the writer's teams too, so the two read the same. */
export type DocumentMentionMiss = "unknown" | "muted" | "agent_save" | "writer_muted";

/** How one handle in a saved document reaches its person or agent. Null for the writer's own handle. */
export function documentMentionReach(candidate: MentionCandidate, writer: { userId: string; kind: AuthorKind; muted: boolean }): { reach: DocumentMentionReach; miss: DocumentMentionMiss | null } | null {
  if (candidate.userId !== null && candidate.userId === writer.userId) return null;
  if (writer.kind === "agent" && writer.muted) return { reach: "none", miss: "writer_muted" };
  const refusal = mentionRefusal(candidate, writer.kind === "agent");
  if (refusal === null) return { reach: "reaches", miss: null };
  if (refusal === "cannot_see") return { reach: "later", miss: null };
  if (refusal === "muted") return { reach: "none", miss: "muted" };
  if (refusal === "loop_limit") return { reach: "none", miss: "agent_save" };
  return { reach: "none", miss: "unknown" };
}

/** What the @handles in a saved document do, for the writer: who hears of it, who will once they can read it, and who never will, with why. */
export interface DocumentMentionReport {
  reaches: string[];
  onceTheyCanRead: string[];
  notNotified: { handle: string; message: string }[];
}

/** The writer's report for these candidates, in their order, by documentMentionReach. */
export function documentMentionReportOf(candidates: readonly MentionCandidate[], writer: Parameters<typeof documentMentionReach>[1]): DocumentMentionReport {
  const report: DocumentMentionReport = { reaches: [], onceTheyCanRead: [], notNotified: [] };
  for (const candidate of candidates) {
    const outcome = documentMentionReach(candidate, writer);
    if (outcome?.reach === "reaches") report.reaches.push(candidate.handle);
    else if (outcome?.reach === "later") report.onceTheyCanRead.push(candidate.handle);
    else if (outcome?.miss) report.notNotified.push({ handle: candidate.handle, message: documentMentionMissMessage(candidate.handle, outcome.miss) });
  }
  return report;
}

/** What the writer is told about a handle that reaches nobody. */
export function documentMentionMissMessage(handle: string, miss: DocumentMentionMiss): string {
  const who = `@${handle} will not be notified.`;
  if (miss === "muted") return `${who} This agent is muted here.`;
  if (miss === "agent_save") return `${who} An agent's save never notifies another agent; mention it in a comment instead.`;
  if (miss === "writer_muted") return `${who} You are muted here, so your saves notify nobody.`;
  return `${who} Nobody you can mention has this handle. Mention the artifact's author or a teammate by their exact @handle, not their name.`;
}
