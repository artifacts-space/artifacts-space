import { splitMentions, type MentionKind } from "./mentions";

/**
 * Highlights a comment draft for the composer's backdrop layer. The output
 * labels slices of the input and never adds or drops a character, so the
 * layer's text lines up with the textarea on top of it.
 *
 * It covers the Markdown the comment renderer supports, in a simplified form:
 * fenced code, inline code, backslash escapes, headings, links and bare URLs,
 * bold, italic, strikethrough, and @mentions that resolve.
 */

/** How one slice of the draft is drawn. */
export type HighlightStyle = "mark" | "code" | "codeMark" | "heading" | "strong" | "em" | "del" | "link" | "mention";

/** A slice of the draft and its styles. `mention` is set on resolved mentions. */
export interface HighlightToken {
  text: string;
  styles: HighlightStyle[];
  mention?: MentionKind;
}

const STYLE_FLAGS: readonly (readonly [HighlightStyle, number])[] = [
  ["mark", 1],
  ["code", 2],
  ["codeMark", 4],
  ["heading", 8],
  ["strong", 16],
  ["em", 32],
  ["del", 64],
  ["link", 128],
  ["mention", 256],
];
const MARK = 1;
const CODE = 2;
const CODE_MARK = 4;
const HEADING = 8;
const STRONG = 16;
const EM = 32;
const DEL = 64;
const LINK = 128;
const MENTION = 256;
const AGENT = 512;
/** Never parsed further: code, escaped characters, URLs. */
const PROTECT = 1024;
/** Mentions never start here (links keep one target, as in the renderer). */
const NO_MENTION = 2048;
/** Inside a fenced block. Masked as newlines, so no inline span crosses a block. */
const FENCE = 4096;

/** Stands in for protected or used characters while matching: not a space, not a delimiter (a private-use character). */
const HIDDEN = "\uE000";
const fenceOpen = /^ {0,3}(`{3,}|~{3,})/;
const fenceClose = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const blankLine = /\n[ \t]*\n/g;
const asciiPunctuation = /[!-/:-@[-`{-~]/;
const headingLine = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/gm;
const linkPattern = /\[([^\]\n]+)\]\(([^()\s]*)(?:[ \t]+"[^"\n]*")?\)/g;
const bareUrl = /https?:\/\/[^\s<\uE000]*[^\s<\uE000.,:;"'!?)\]]/g;
/** Delimited spans in matching order: [pattern, delimiter length, style]. Content never crosses a blank line. */
const delimited: readonly (readonly [RegExp, number, number])[] = [
  [/\*\*(?=[^\s*])((?:[^\n]|\n(?![ \t]*\n))*?[^\s*])\*\*/g, 2, STRONG],
  [/(?<![\p{L}\p{N}_])__(?=[^\s_])((?:[^\n]|\n(?![ \t]*\n))*?[^\s_])__(?![\p{L}\p{N}_])/gu, 2, STRONG],
  [/(?<!~)~~(?=[^\s~])((?:[^~\n]|\n(?![ \t]*\n))*?[^\s~])~~(?!~)/g, 2, DEL],
  [/(?<!~)~(?=[^\s~])((?:[^~\n]|\n(?![ \t]*\n))*?[^\s~])~(?!~)/g, 1, DEL],
  [/\*(?=[^\s*])((?:[^*\n]|\n(?![ \t]*\n))*?[^\s*])\*/g, 1, EM],
  [/(?<![\p{L}\p{N}_])_(?=[^\s_])((?:[^_\n]|\n(?![ \t]*\n))*?[^\s_])_(?![\p{L}\p{N}_])/gu, 1, EM],
];

function fill(flags: Uint16Array, from: number, to: number, flag: number) {
  for (let index = from; index < to; index += 1) flags[index] = (flags[index] ?? 0) | flag;
}

/** The fence run when `line` opens a fenced block, else null. A backtick fence's info string has no backticks. */
function openingFence(line: string): string | null {
  const run = fenceOpen.exec(line)?.[1];
  if (!run) return null;
  const info = line.slice(line.indexOf(run) + run.length);
  return run.startsWith("`") && info.includes("`") ? null : run;
}

/** Closing fence for an open one: same character, at least as long. */
function closesFence(line: string, open: string) {
  const run = fenceClose.exec(line)?.[1];
  return run !== undefined && run.startsWith(open.charAt(0)) && run.length >= open.length;
}

/**
 * Fenced code blocks. An unclosed fence runs to the end of the text, as in
 * CommonMark. Newlines inside a block belong to it.
 */
function markFences(text: string, flags: Uint16Array) {
  let open: string | null = null;
  let offset = 0;
  for (const line of text.split("\n")) {
    const end = offset + line.length;
    const withNewline = Math.min(end + 1, text.length);
    if (open === null) {
      open = openingFence(line);
      if (open !== null) fill(flags, offset, withNewline, CODE_MARK | FENCE | PROTECT);
    } else if (closesFence(line, open)) {
      open = null;
      fill(flags, offset, end, CODE_MARK | FENCE | PROTECT);
    } else {
      fill(flags, offset, withNewline, CODE | FENCE | PROTECT);
    }
    offset = end + 1;
  }
}

/** Where a code span opened at `from` must close by: the next blank line or fenced block. */
function spanLimit(text: string, flags: Uint16Array, from: number) {
  blankLine.lastIndex = from;
  const blank = blankLine.exec(text);
  let limit = blank ? blank.index : text.length;
  for (let index = from; index < limit; index += 1) {
    if ((flags[index] ?? 0) & PROTECT) limit = index;
  }
  return limit;
}

function runLength(text: string, from: number) {
  let end = from;
  while (text[end] === "`") end += 1;
  return end - from;
}

/** The start of the next backtick run of exactly `length` before `limit`, or -1. */
function closingRun(text: string, from: number, limit: number, length: number) {
  let index = from;
  while (index < limit) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    const run = runLength(text, index);
    if (run === length && index + run <= limit) return index;
    index += run;
  }
  return -1;
}

/**
 * Inline code spans and backslash escapes, left to right. A backtick run with
 * no closing run of the same length stays literal text.
 */
function markCodeAndEscapes(text: string, flags: Uint16Array) {
  let index = 0;
  while (index < text.length) {
    const flag = flags[index] ?? 0;
    const char = text[index];
    if (flag & PROTECT) {
      index += 1;
    } else if (char === "\\" && asciiPunctuation.test(text[index + 1] ?? "")) {
      fill(flags, index, index + 1, MARK);
      fill(flags, index + 1, index + 2, PROTECT);
      index += 2;
    } else if (char === "`") {
      index = markCodeSpan(text, flags, index);
    } else {
      index += 1;
    }
  }
}

/** Marks the code span opening at `start` and returns where scanning continues. */
function markCodeSpan(text: string, flags: Uint16Array, start: number) {
  const length = runLength(text, start);
  const close = closingRun(text, start + length, spanLimit(text, flags, start), length);
  if (close < 0) return start + length;
  fill(flags, start, start + length, CODE_MARK | PROTECT);
  fill(flags, start + length, close, CODE | PROTECT);
  fill(flags, close, close + length, CODE_MARK | PROTECT);
  return close + length;
}

/** The text with protected or used characters hidden, for matching inline syntax. */
function maskedText(text: string, flags: Uint16Array, hiddenFlags: number, hidden: string) {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const flag = flags[index] ?? 0;
    if (flag & FENCE) out += "\n";
    else out += flag & hiddenFlags ? hidden : (text[index] ?? "");
  }
  return out;
}

function markHeadings(text: string, flags: Uint16Array) {
  for (const match of maskedText(text, flags, PROTECT, HIDDEN).matchAll(headingLine)) {
    const hashes = match[1] ?? "";
    const start = match.index + match[0].indexOf(hashes);
    fill(flags, start, start + hashes.length, MARK);
    fill(flags, start + hashes.length, match.index + match[0].length, HEADING);
  }
}

function markLinks(text: string, flags: Uint16Array) {
  for (const match of maskedText(text, flags, PROTECT, HIDDEN).matchAll(linkPattern)) {
    const label = match[1] ?? "";
    const start = match.index;
    const end = start + match[0].length;
    fill(flags, start, end, NO_MENTION);
    fill(flags, start, start + 1, MARK | PROTECT);
    fill(flags, start + 1, start + 1 + label.length, LINK);
    fill(flags, start + 1 + label.length, end, MARK | PROTECT);
  }
  for (const match of maskedText(text, flags, PROTECT | NO_MENTION, HIDDEN).matchAll(bareUrl)) {
    fill(flags, match.index, match.index + match[0].length, LINK | PROTECT | NO_MENTION);
  }
}

/** Bold, strikethrough, then italic. Used delimiters are hidden so a later pattern cannot reuse them. */
function markDelimited(text: string, flags: Uint16Array) {
  for (const [pattern, size, style] of delimited) {
    for (const match of maskedText(text, flags, PROTECT | MARK, HIDDEN).matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      fill(flags, start, start + size, MARK);
      fill(flags, start + size, end - size, style);
      fill(flags, end - size, end, MARK);
    }
  }
}

function markMentions(text: string, flags: Uint16Array, resolved: ReadonlyMap<string, MentionKind>) {
  if (resolved.size === 0) return;
  let offset = 0;
  for (const segment of splitMentions(maskedText(text, flags, PROTECT | NO_MENTION, " "), resolved)) {
    if (segment.type === "mention") fill(flags, offset, offset + segment.value.length, MENTION | (segment.kind === "agent" ? AGENT : 0));
    offset += segment.value.length;
  }
}

function toToken(text: string, flag: number): HighlightToken {
  const styles = STYLE_FLAGS.flatMap(([style, bit]) => (flag & bit ? [style] : []));
  if (!(flag & MENTION)) return { text, styles };
  return { text, styles, mention: flag & AGENT ? "agent" : "person" };
}

/** Joins runs of characters with the same visible styles into tokens. */
function toTokens(text: string, flags: Uint16Array): HighlightToken[] {
  const visible = (index: number) => (flags[index] ?? 0) & ~(PROTECT | NO_MENTION | FENCE);
  const tokens: HighlightToken[] = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    if (index < text.length && visible(index) === visible(start)) continue;
    tokens.push(toToken(text.slice(start, index), visible(start)));
    start = index;
  }
  return tokens;
}

/**
 * Splits a comment draft into styled tokens for the composer's highlight
 * layer. Joining every token's text gives back `text` exactly. Only handles in
 * `resolved` become mentions; anything else typed after "@" stays plain.
 */
export function highlightDraft(text: string, resolved: ReadonlyMap<string, MentionKind>): HighlightToken[] {
  if (!text) return [];
  const flags = new Uint16Array(text.length);
  markFences(text, flags);
  markCodeAndEscapes(text, flags);
  markHeadings(text, flags);
  markLinks(text, flags);
  markDelimited(text, flags);
  markMentions(text, flags, resolved);
  return toTokens(text, flags);
}
