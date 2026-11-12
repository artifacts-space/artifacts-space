import { stripCode } from "@/lib/comments/mentions";

/*
 * Text in a comment, written as Markdown with as few escapes as possible:
 * what a person types stays as they typed it ("Q&A at 3 < 4pm",
 * "snake_case", "2 * 3", "[docs]"), and a character is escaped only where
 * leaving it bare could change how the comment renders. The round trip
 * (markdown-roundtrip.ts) checks every block written this way by reading it
 * back, and falls back to the editor's full escaping when the reading differs,
 * so a case these rules miss costs a backslash, never the meaning.
 */

/** ASCII punctuation: a backslash before one of these is an escape. */
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
/** An `&` that a Markdown reader would take as an entity: `&copy;`, `&#169;`, `&#xA9;`. */
const ENTITY_START = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{0,31});/;
/** A `<` that could open a tag, a comment, or an autolink. */
const TAG_START = /^<[A-Za-z/!?]/;

const WHITESPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;

function isSpace(char: string | undefined): boolean {
  return char !== undefined && WHITESPACE.test(char);
}

function isWord(char: string | undefined): boolean {
  return char !== undefined && WORD.test(char);
}

/** `*` and `~` open or close emphasis only beside a non-space character. */
function flankedBySpace(previous: string | undefined, next: string | undefined): boolean {
  return isSpace(previous) && isSpace(next);
}

interface Around {
  text: string;
  index: number;
  previous: string | undefined;
  next: string | undefined;
}

/** How each character that Markdown may read as syntax is written; every other character is written as is. */
const ESCAPES: Readonly<Record<string, (around: Around) => string>> = {
  "\\": ({ next }) => (next !== undefined && (ASCII_PUNCTUATION.test(next) || next === "\n") ? "\\\\" : "\\"),
  "&": ({ text, index }) => (ENTITY_START.test(text.slice(index)) ? "&amp;" : "&"),
  "<": ({ text, index }) => (TAG_START.test(text.slice(index)) ? "&lt;" : "<"),
  "`": () => "\\`",
  "*": ({ previous, next }) => (flankedBySpace(previous, next) ? "*" : "\\*"),
  "~": ({ previous, next }) => (flankedBySpace(previous, next) ? "~" : "\\~"),
  _: ({ previous, next }) => (flankedBySpace(previous, next) || (isWord(previous) && isWord(next)) ? "_" : "\\_"),
  "]": ({ next }) => (next === "(" || next === "[" || next === ":" ? "\\]" : "]"),
};

/** The Markdown for one character of text at `index`, in the text around it. */
function escapeAt(text: string, index: number): string {
  const char = text.charAt(index);
  const escape = ESCAPES[char];
  if (!escape) return char;
  return escape({ text, index, previous: index > 0 ? text.charAt(index - 1) : undefined, next: index + 1 < text.length ? text.charAt(index + 1) : undefined });
}

/** How a line can start a block in Markdown: a heading, a list item, a quote, a rule or underline, or a task box. */
const LINE_STARTS: readonly RegExp[] = [
  /^(\s*)(#{1,6})(?=\s|$)/,
  /^(\s*)([-+*])(?=\s|$)/,
  /^(\s*)\d{1,9}([.)])(?=\s|$)/,
  /^(\s*)(>)/,
  /^(\s*)([-=*_])[-=*_\s]*$/,
  /^(\s*)(\[)[ xX]\](?=\s)/,
];

/** Where a line's block marker sits, so one backslash before it keeps the line text. */
function markerAt(line: string): number | null {
  for (const pattern of LINE_STARTS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    // An ordered list's marker is its "." or ")", after the number.
    if (pattern === LINE_STARTS[2]) return line.indexOf(match[2] ?? ".", indent);
    return indent;
  }
  return null;
}

/**
 * Comment text as Markdown, escaped only where it must be. `lineStart` says
 * the text begins a line (the start of its paragraph, heading, list item, or
 * the text after a line break), where a block marker such as `# ` or `1. `
 * would otherwise start a heading or a list.
 */
export function commentTextMarkdown(text: string, lineStart: boolean): string {
  let output = "";
  let atLineStart = lineStart;
  let marker: number | null = null;
  for (let index = 0; index < text.length; index += 1) {
    if (atLineStart) {
      const relative = markerAt(text.slice(index).split("\n", 1)[0] ?? "");
      marker = relative === null ? null : index + relative;
      atLineStart = false;
    }
    const escaped = escapeAt(text, index);
    output += index === marker && escaped.length === 1 ? `\\${escaped}` : escaped;
    if (text.charAt(index) === "\n") atLineStart = true;
  }
  return output;
}

/** An escaped "@" before a handle: text the writer kept from being a mention. */
const ESCAPED_MENTION = /\\@[a-z0-9]/i;
/** A named entity, such as `&copy;`, that the editor would show as its letters rather than its character. */
const UNREAD_ENTITY = /(?<!\\)&(?!(?:amp|lt|gt|quot);)[A-Za-z][A-Za-z0-9]{0,31};/;

/**
 * True when a comment's block must stay exactly as written: the editor would
 * show it differently from how it renders, and writing it back would change
 * it. `\@dana` would turn into a mention that notifies dana, and `&copy;`
 * into the letters "&copy;". Such a block shows as Markdown kept as written,
 * which can still be edited as text.
 */
export function commentKeepsAsWritten(source: string): boolean {
  const text = stripCode(source);
  return ESCAPED_MENTION.test(text) || UNREAD_ENTITY.test(text);
}
