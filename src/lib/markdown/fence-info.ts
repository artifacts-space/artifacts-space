/**
 * Attributes on a fenced code block's info string (markdown-dialect.md,
 * "Code block attributes"): an optional `{…}` block at the end of the line
 * that opens the fence, after the language.
 *
 * ````md
 * ```mermaid {view=split caption="How a change ships"}
 * ````
 *
 * Inside the braces, `key=value` pairs are separated by spaces. A value is a
 * bare word, or double-quoted with `\"` and `\\` escaped. `view` (mermaid
 * blocks only), `caption`, and `wrap=true` (any code block) are known;
 * anything else is kept as written and ignored. A block that does not parse
 * is ignored whole.
 *
 * Both Markdown parsers decode backslash escapes in the info string, so these
 * functions read the fence line as written (`fenceInfoOfLine`), never the
 * parsers' decoded `lang` or `meta`.
 */

import { isMermaidLanguage } from "./mermaid-fence";

/** How a mermaid block shows: the source, the diagram, or both. */
export type DiagramView = "code" | "preview" | "split";

/** Every view, in the order the editor's switch offers them. */
export const diagramViews: readonly DiagramView[] = ["code", "preview", "split"];

/** A mermaid block with no `view`, or one this version does not know, shows the diagram. */
export const defaultDiagramView: DiagramView = "preview";

/** Longest caption kept, in characters. */
export const maxCaptionLength = 500;

/** One `key=value` pair, as written. */
interface Pair {
  key: string;
  value: string;
  raw: string;
}

/** The attribute block found at the end of an info string. */
interface AttributeBlock {
  /** Where the block's `{` starts. */
  start: number;
  pairs: Pair[];
}

/** What a fence's info string says. */
export interface FenceInfo {
  /** The first word of the info string, as written; "" when there is none. */
  language: string;
  /** The `view` attribute when it names a known view, else null. */
  view: DiagramView | null;
  /** The `caption` attribute, or null when there is none or it is empty. */
  caption: string | null;
  /** True when `wrap=true`: long lines wrap instead of scrolling sideways. */
  wrap: boolean;
}

const keyPattern = /^[A-Za-z][\w-]*$/u;

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\t";
}

/** Reads a double-quoted value from `text` at `index` (the opening quote). */
function readQuoted(text: string, index: number): { value: string; end: number } | null {
  let value = "";
  for (let at = index + 1; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (char === '"') return { value, end: at + 1 };
    if (char === "\\" && (text[at + 1] === '"' || text[at + 1] === "\\")) {
      value += text.charAt(at + 1);
      at += 1;
    } else {
      value += char;
    }
  }
  return null;
}

/** Reads a bare value from `text` at `index`: up to a space or the closing brace. */
function readBare(text: string, index: number): { value: string; end: number } | null {
  let end = index;
  while (end < text.length && !isSpace(text[end]) && !'"{}'.includes(text.charAt(end))) end += 1;
  return end > index ? { value: text.slice(index, end), end } : null;
}

/** Reads one `key=value` pair at `index`, or null when the text there is not one. */
function readPair(text: string, index: number): { pair: Pair; end: number } | null {
  const equals = text.indexOf("=", index);
  if (equals < 0) return null;
  const key = text.slice(index, equals);
  if (!keyPattern.test(key)) return null;
  const read = text[equals + 1] === '"' ? readQuoted(text, equals + 1) : readBare(text, equals + 1);
  if (!read) return null;
  return { pair: { key, value: read.value, raw: text.slice(index, read.end) }, end: read.end };
}

/** Parses `{…}` starting at `start` when it runs exactly to the end of `info`. */
function parseBlockAt(info: string, start: number): Pair[] | null {
  const pairs: Pair[] = [];
  let at = start + 1;
  for (;;) {
    while (isSpace(info[at])) at += 1;
    if (info[at] === "}") return at === info.length - 1 ? pairs : null;
    const read = readPair(info, at);
    if (!read) return null;
    pairs.push(read.pair);
    at = read.end;
    if (!isSpace(info[at]) && info[at] !== "}") return null;
  }
}

/** The attribute block at the end of `info`: the first `{`, after a space, from which the rest parses. */
function findBlock(info: string): AttributeBlock | null {
  if (!info.endsWith("}")) return null;
  for (let start = info.indexOf("{"); start >= 0; start = info.indexOf("{", start + 1)) {
    if (start > 0 && !isSpace(info[start - 1])) continue;
    const pairs = parseBlockAt(info, start);
    if (pairs) return { start, pairs };
  }
  return null;
}

function pairValue(block: AttributeBlock | null, key: string): string | undefined {
  return block?.pairs.find((pair) => pair.key === key)?.value;
}

/** A view name read loosely (any case), or null when it is not one this version knows. */
export function readDiagramView(value: unknown): DiagramView | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return diagramViews.find((view) => view === lower) ?? null;
}

/** A caption as it is stored: one line, trimmed, capped; null when empty. */
export function cleanCaption(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/gu, " ").trim();
  return line ? line.slice(0, maxCaptionLength) : null;
}

/** Reads a fence's info string (as written on the fence line). Unknown and malformed attributes are ignored. */
export function parseFenceInfo(info: unknown): FenceInfo {
  if (typeof info !== "string") return { language: "", view: null, caption: null, wrap: false };
  const trimmed = info.trim();
  const block = findBlock(trimmed);
  const head = block ? trimmed.slice(0, block.start) : trimmed;
  const [language = ""] = head.trim().split(/\s+/u);
  return {
    language,
    view: readDiagramView(pairValue(block, "view")),
    caption: cleanCaption(pairValue(block, "caption")),
    wrap: pairValue(block, "wrap")?.toLowerCase() === "true",
  };
}

/** The language word of an info string: its first word, ignoring an attribute block. */
export function fenceLanguage(info: unknown): string {
  return parseFenceInfo(info).language;
}

function quote(value: string): string {
  return `"${value.replace(/[\\"]/gu, (char) => `\\${char}`)}"`;
}

/** Attribute changes: a value sets the key, null removes it, and undefined leaves it as it is. */
export interface FenceAttributeChanges {
  view?: DiagramView | null;
  caption?: string | null;
  /** True writes `wrap=true`; false removes it. */
  wrap?: boolean;
}

function pairFor(key: string, value: string): Pair {
  const raw = key === "caption" ? `${key}=${quote(value)}` : `${key}=${value}`;
  return { key, value, raw };
}

/** The pairs after applying `changes`, keeping unknown pairs and the written order. */
function changedPairs(pairs: readonly Pair[], changes: Readonly<Record<string, string | null | undefined>>): Pair[] {
  let next = [...pairs];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const at = next.findIndex((pair) => pair.key === key);
    next = next.filter((pair, index) => pair.key !== key || index === at);
    if (value === null) next = next.filter((pair) => pair.key !== key);
    else if (at >= 0) next[at] = pairFor(key, value);
    else next.push(pairFor(key, value));
  }
  return next;
}

/**
 * The info string with `changes` applied: the rest of the line stays as
 * written, and the attribute block goes when it is left empty. A block with
 * attributes needs a language before it, so a block with none gets `text`.
 */
export function withFenceAttributes(info: string, changes: FenceAttributeChanges): string {
  const trimmed = info.trim();
  const block = findBlock(trimmed);
  const head = (block ? trimmed.slice(0, block.start) : trimmed).trimEnd();
  const pairs = changedPairs(block?.pairs ?? [], {
    view: changes.view,
    caption: changes.caption === undefined ? undefined : cleanCaption(changes.caption),
    wrap: changes.wrap === undefined ? undefined : changes.wrap ? "true" : null,
  });
  if (pairs.length === 0) return head;
  return `${head || "text"} {${pairs.map((pair) => pair.raw).join(" ")}}`;
}

/**
 * The info string with its language word replaced by `language` (or removed
 * when null), keeping the rest of the line and any attributes. `view` means
 * something only on a mermaid block, so it goes when the language becomes
 * another one; a later switch back then starts from the default view. A
 * block with attributes and no language gets `text`.
 */
export function withFenceLanguage(info: unknown, language: string | null): string {
  const written = typeof info === "string" ? info.trim() : "";
  const current = isMermaidLanguage(language) ? written : withFenceAttributes(written, { view: null });
  const block = findBlock(current);
  const head = block ? current.slice(0, block.start).trim() : current;
  const rest = head.split(/\s+/u).slice(1).join(" ");
  const nextHead = [language ?? "", rest].filter(Boolean).join(" ");
  const tail = block ? current.slice(block.start) : "";
  if (!tail) return nextHead;
  return `${nextHead || "text"} ${tail}`;
}

const fenceLinePattern = /^[ \t]*(`{3,}|~{3,})([^\n]*)/u;

/** The info string of a fenced block's opening line as written, or null when the line opens no fence. */
export function fenceInfoOfLine(line: string): string | null {
  const match = fenceLinePattern.exec(line);
  return match ? (match[2] ?? "").trim() : null;
}
