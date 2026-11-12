/** Small text helpers for social preview images, where nothing can scroll or wrap freely. */

const ellipsis = "…";

/** `text` cut to at most `max` characters, ending in an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join("").trimEnd()}${ellipsis}`;
}

/** Collapses runs of whitespace (including line breaks) into single spaces. */
export function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const fence = /^\s*(```|~~~)/;
const inlineRules: readonly [RegExp, string][] = [
  [/<!--[\s\S]*?-->/g, ""],
  [/!\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/\[([^\]]+)\]\([^)]*\)/g, "$1"],
  [/\[([^\]]+)\]\[[^\]]*\]/g, "$1"],
  [/<(https?:\/\/[^>]+)>/g, "$1"],
  [/<\/?[a-zA-Z][^>]*>/g, ""],
  [/`([^`]*)`/g, "$1"],
  [/(\*\*|__)(.+?)\1/g, "$2"],
  [/(\*|_)(.+?)\1/g, "$2"],
  [/~~(.+?)~~/g, "$1"],
  [/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1"],
];
const blockPrefix = /^\s{0,3}(?:>\s?)*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/;
const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const rule = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const tableDivider = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** A line that is only an image: a media block (an upload, video, or file), not prose. */
const mediaLine = /^\s{0,3}(?:>\s?)*!\[[^\]]*\]\([^)]*\)\s*$/;

/** Markdown inline syntax removed: links and images keep their text, emphasis and code marks go. */
export function stripInlineMarkdown(text: string): string {
  let plain = text;
  for (const [pattern, replacement] of inlineRules) plain = plain.replace(pattern, replacement);
  return squash(plain.replace(/\|/g, " "));
}

export interface PlainMarkdown {
  /** The first heading's text, or null when there is none. */
  heading: string | null;
  /** Lines of body text in order, without headings, code blocks, rules, or table dividers. */
  lines: string[];
}

function bodyLine(line: string): string | null {
  if (rule.test(line) || tableDivider.test(line) || mediaLine.test(line)) return null;
  const plain = stripInlineMarkdown(line.replace(blockPrefix, ""));
  return plain === "" ? null : plain;
}

type MarkdownLine = { kind: "fence" } | { kind: "heading"; text: string } | { kind: "body"; text: string } | { kind: "skip" };

function classify(line: string): MarkdownLine {
  if (fence.test(line)) return { kind: "fence" };
  const headingMatch = heading.exec(line);
  if (headingMatch) return { kind: "heading", text: stripInlineMarkdown(headingMatch[1] ?? "") };
  const plain = bodyLine(line);
  return plain === null ? { kind: "skip" } : { kind: "body", text: plain };
}

/** Lines outside fenced code blocks, classified. */
function readableLines(markdown: string): MarkdownLine[] {
  const readable: MarkdownLine[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    const parsed = classify(line);
    if (parsed.kind === "fence") inFence = !inFence;
    else if (!inFence && parsed.kind !== "skip") readable.push(parsed);
  }
  return readable;
}

/** The first heading and the plain body lines of a Markdown document, keeping at most `maxLines` body lines. */
export function plainMarkdown(markdown: string, maxLines: number): PlainMarkdown {
  const result: PlainMarkdown = { heading: null, lines: [] };
  for (const line of readableLines(markdown)) {
    if (line.kind === "heading") result.heading ??= line.text || null;
    if (line.kind === "body" && result.lines.length < maxLines) result.lines.push(line.text);
  }
  return result;
}
