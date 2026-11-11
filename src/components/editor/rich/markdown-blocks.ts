/** A loose view of a marked token: only the fields the block checks read. */
export interface LooseToken {
  type: string;
  raw: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Token types the editor cannot show as formatted text. */
const rawTokenTypes: ReadonlySet<string> = new Set(["html", "def", "image"]);

/** Footnote references and definitions, which marked does not parse. */
const footnotePattern = /\[\^[^\]\s]+\]/;

/** Fields of a marked token that hold child tokens. */
const childFields = ["tokens", "items", "header", "rows"] as const;

function childValues(node: Record<string, unknown>): unknown[] {
  const children: unknown[] = [];
  for (const field of childFields) {
    const value = node[field];
    if (Array.isArray(value)) children.push(...(value as unknown[]));
  }
  return children;
}

/** True when the token, or any token inside it, is a type the editor cannot show. */
function containsRawToken(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsRawToken(item));
  if (!isRecord(value)) return false;
  if (typeof value.type === "string" && rawTokenTypes.has(value.type)) return true;
  return childValues(value).some((child) => containsRawToken(child));
}

/**
 * True when a top-level block must stay as written: raw HTML (block or
 * inline), images inside text (an image alone in its paragraph is a media
 * block, a token of its own), link reference definitions, and footnotes.
 * The editor keeps these as raw blocks instead of dropping or rewriting them.
 */
export function needsRawBlock(token: unknown): boolean {
  if (!isRecord(token)) return true;
  const raw = typeof token.raw === "string" ? token.raw : "";
  if (footnotePattern.test(raw)) return true;
  return containsRawToken(token);
}

/** One top-level block of the source, with the whitespace that follows it. */
export interface SourceBlock {
  /** The block's source without its trailing newlines. */
  text: string;
  /** The newlines and blank lines between this block and the next. */
  after: string;
  token: unknown;
}

/** The source split into top-level blocks, with the whitespace before the first. */
export interface SplitSource {
  leading: string;
  blocks: SourceBlock[];
}

/**
 * Splits Markdown into top-level blocks using marked's tokens. Each token's
 * `raw` is a slice of the source, so the slices and the whitespace between
 * them add back up to the source. Returns null if they ever do not.
 */
export function splitBlocks(source: string, tokens: readonly LooseToken[]): SplitSource | null {
  const result: SplitSource = { leading: "", blocks: [] };
  let offset = 0;
  for (const token of tokens) {
    if (!source.startsWith(token.raw, offset)) return null;
    offset += token.raw.length;
    appendToken(result, token);
  }
  if (offset !== source.length) appendWhitespace(result, source.slice(offset));
  return result;
}

function appendWhitespace(result: SplitSource, text: string) {
  const last = result.blocks.at(-1);
  if (last) last.after += text;
  else result.leading += text;
}

function appendToken(result: SplitSource, token: LooseToken) {
  if (token.type === "space" || !token.raw.trim()) {
    appendWhitespace(result, token.raw);
    return;
  }
  const text = token.raw.replace(/\s+$/, "");
  result.blocks.push({ text, after: token.raw.slice(text.length), token });
}
