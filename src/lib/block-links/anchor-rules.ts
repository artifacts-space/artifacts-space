import { z } from "zod";

/*
 * Links to one block of a Markdown artifact, with no stored block ids.
 *
 * A block is named by its opening words: the fewest words (five or more)
 * that only that block starts with. When two blocks start the same way, the
 * link also says which one (`n`, counted from the top). A block with no text
 * is named by the uploaded file it shows, or, failing that, by its place
 * among the top-level blocks.
 *
 * The link is `/artifact/<id>#block=<words>:~:text=<words>`. The text
 * fragment (`:~:text=`) lets the browser scroll to the words and mark them
 * even before the page's script runs; the page then finds the block itself
 * (`findAnchoredBlock`), scrolls it to the middle, and highlights it for a
 * moment. Editing other blocks never breaks a link, and editing the block's
 * later words does not either; only rewording its opening words does.
 *
 * "Blocks" are the same list on every surface (`AnchorBlock`): each
 * top-level block that is not a list, then every list item at any depth, in
 * document order. The editor builds it from the document; the read view
 * builds it from the rendered page.
 */

/** One block as a link sees it. */
export interface AnchorBlock {
  /** The block's text with whitespace collapsed (`normalizeBlockText`); block boundaries count as spaces. */
  text: string;
  /** The uploaded files the block shows, by id. */
  fileIds: readonly string[];
  /** The index of the top-level block it is in. */
  topIndex: number;
}

/** What a link names: opening words (and which match), an uploaded file, or a place. */
export type BlockAnchor =
  | { kind: "words"; words: string; nth: number }
  | { kind: "file"; fileId: string }
  | { kind: "place"; index: number };

const MIN_WORDS = 5;
const MAX_WORDS = 24;
const MAX_WORD_CHARS = 160;

/** Collapses every run of whitespace to one space and trims the ends. */
export function normalizeBlockText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when `text` starts with the whole words of `words` (never part of a word). */
export function startsWithWords(text: string, words: string): boolean {
  if (!words) return false;
  return text === words || text.startsWith(`${words} `);
}

/** The opening words of `text`, at most `count` and at most 160 characters. */
function openingWords(words: readonly string[], count: number): string {
  let phrase = "";
  for (const word of words.slice(0, count)) {
    const next = phrase ? `${phrase} ${word}` : word;
    if (next.length > MAX_WORD_CHARS) return phrase || word.slice(0, MAX_WORD_CHARS);
    phrase = next;
  }
  return phrase;
}

/** The indices of the blocks that start with `words`. */
function blocksStartingWith(blocks: readonly AnchorBlock[], words: string): number[] {
  const found: number[] = [];
  blocks.forEach((block, index) => {
    if (startsWithWords(block.text, words)) found.push(index);
  });
  return found;
}

/** The shortest opening that only this block starts with, or the longest one when none is unique. */
function uniqueOpening(blocks: readonly AnchorBlock[], words: readonly string[]): string {
  const longest = Math.min(words.length, MAX_WORDS);
  let phrase = openingWords(words, Math.min(MIN_WORDS, longest));
  for (let count = MIN_WORDS; count <= longest; count += 1) {
    phrase = openingWords(words, count);
    if (blocksStartingWith(blocks, phrase).length <= 1) return phrase;
  }
  return phrase;
}

/**
 * The anchor for `blocks[target]`: its opening words (with `nth` when other
 * blocks start the same way), else the first file it shows, else its place.
 * Null when there is no such block.
 */
export function buildBlockAnchor(blocks: readonly AnchorBlock[], target: number): BlockAnchor | null {
  const block = blocks[target];
  if (!block) return null;
  const words = block.text.split(" ").filter(Boolean);
  if (words.length > 0) {
    const phrase = uniqueOpening(blocks, words);
    const nth = blocksStartingWith(blocks, phrase).indexOf(target) + 1;
    return { kind: "words", words: phrase, nth: Math.max(1, nth) };
  }
  const [fileId] = block.fileIds;
  if (fileId) return { kind: "file", fileId };
  return { kind: "place", index: block.topIndex };
}

/**
 * Percent-encodes words for a link, parentheses included: a stray `(` or `)`
 * would end the link early where it is pasted into Markdown or plain text.
 */
function encodeWords(words: string): string {
  return encodeURIComponent(words).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Percent-encodes words for a text fragment, where `-`, `,`, and `&` have meanings of their own. */
export function encodeTextDirective(words: string): string {
  return encodeWords(words).replace(/-/g, "%2D");
}

/**
 * The text fragment for an anchor, or "" when the browser's own search could
 * land on the wrong block: a block named by a file or place, or words that
 * an earlier block also starts with.
 */
function textDirective(anchor: BlockAnchor): string {
  if (anchor.kind !== "words" || anchor.nth !== 1) return "";
  return `:~:text=${encodeTextDirective(anchor.words)}`;
}

/** The URL fragment for an anchor, with the leading `#`. */
export function blockHash(anchor: BlockAnchor): string {
  if (anchor.kind === "file") return `#block-file=${anchor.fileId}`;
  if (anchor.kind === "place") return `#block-at=${String(anchor.index)}`;
  const nth = anchor.nth > 1 ? `&n=${String(anchor.nth)}` : "";
  return `#block=${encodeWords(anchor.words)}${nth}${textDirective(anchor)}`;
}

/** The full link to a block: the artifact page with the block's fragment. */
export function blockLink(origin: string, publicId: string, anchor: BlockAnchor): string {
  return `${origin}/artifact/${encodeURIComponent(publicId)}${blockHash(anchor)}`;
}

const uuid = z.uuid();
const hashSchema = z.union([
  z.object({ block: z.string().min(1).max(MAX_WORD_CHARS * 2), n: z.coerce.number().int().min(1).max(10_000).default(1) }),
  z.object({ "block-file": uuid }),
  z.object({ "block-at": z.coerce.number().int().min(0).max(100_000) }),
]);

/** The fields of a fragment such as `block=Some%20words&n=2`, without a text directive. */
function hashFields(hash: string): Record<string, string> | null {
  const body = hash.replace(/^#/, "").split(":~:")[0] ?? "";
  if (!body.startsWith("block")) return null;
  try {
    return Object.fromEntries(new URLSearchParams(body));
  } catch {
    return null;
  }
}

/**
 * Reads a block anchor from a URL fragment (`location.hash`), or null when it
 * names no block. Browsers that understand text fragments leave them out of
 * `location.hash`; the others leave them in, and they are ignored here.
 */
export function parseBlockHash(hash: string): BlockAnchor | null {
  const fields = hashFields(hash);
  if (!fields) return null;
  const parsed = hashSchema.safeParse(fields);
  if (!parsed.success) return null;
  const value = parsed.data;
  if ("block-file" in value) return { kind: "file", fileId: value["block-file"].toLowerCase() };
  if ("block-at" in value) return { kind: "place", index: value["block-at"] };
  const words = normalizeBlockText(value.block);
  return words ? { kind: "words", words, nth: value.n } : null;
}

/** The block a words anchor names: the nth that starts with the words, else the first that contains them. */
function findByWords(blocks: readonly AnchorBlock[], words: string, nth: number): number {
  const starting = blocksStartingWith(blocks, words);
  if (starting.length > 0) return starting[Math.min(nth, starting.length) - 1] ?? -1;
  return blocks.findIndex((block) => block.text.includes(words));
}

/** The index of the block an anchor names, or -1 when no block matches. */
export function findAnchoredBlock(blocks: readonly AnchorBlock[], anchor: BlockAnchor): number {
  if (anchor.kind === "words") return findByWords(blocks, anchor.words, anchor.nth);
  if (anchor.kind === "file") return blocks.findIndex((block) => block.fileIds.includes(anchor.fileId));
  return blocks.findIndex((block) => block.topIndex === anchor.index);
}
