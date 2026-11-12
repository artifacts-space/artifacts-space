/**
 * Where an inline comment sits in an artifact's text: the words it was made
 * on (the quote) and a little text before and after them, so the place is
 * found again after edits (a text-quote selector). Matching ignores every
 * space and line break, so the same words match in the editor, in the read
 * view, and in the text an agent reads, however each breaks its lines.
 * Pure, and shared by the browser and the server.
 */

/** The longest quote a comment keeps. A longer selection is anchored on its first part. */
export const QUOTE_MAX_LENGTH = 1000;

/** How much text before and after the quote is kept, to tell repeated words apart. */
export const ANCHOR_CONTEXT_LENGTH = 64;

/** The words a comment was made on, with the text around them. */
export interface CommentAnchor {
  quote: string;
  /** Text just before the quote; empty at the start of the text. */
  prefix: string;
  /** Text just after the quote; empty at the end of the text. */
  suffix: string;
}

/** A stretch of a text: `start` is its first character, `end` is one past its last. */
export interface TextSpan {
  start: number;
  end: number;
}

/** Spaces, line breaks, and the zero-width characters editors put in text. */
const ignored = /[\s​﻿]/;

/** A text without the characters matching ignores, and where each kept character was. */
interface Squeezed {
  text: string;
  /** `at[i]` is the place in the original text of the squeezed text's character `i`. */
  at: number[];
}

function squeeze(text: string): Squeezed {
  const kept: string[] = [];
  const at: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (ignored.test(character)) continue;
    kept.push(character);
    at.push(index);
  }
  return { text: kept.join(""), at };
}

/** How many characters two texts share, counted back from their ends. */
function sharedEnd(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let count = 0;
  while (count < limit && left.charAt(left.length - 1 - count) === right.charAt(right.length - 1 - count)) count += 1;
  return count;
}

/** How many characters two texts share, counted from their starts. */
function sharedStart(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let count = 0;
  while (count < limit && left.charAt(count) === right.charAt(count)) count += 1;
  return count;
}

/** Every place `quote` starts in `text`. */
function occurrences(text: string, quote: string): number[] {
  const found: number[] = [];
  for (let from = text.indexOf(quote); from !== -1; from = text.indexOf(quote, from + 1)) found.push(from);
  return found;
}

/** Text on one line, as a quote is stored and shown: each run of spaces and line breaks is one space. */
function oneLine(value: string): string {
  return value.replace(/[\s​﻿]+/g, " ").trim();
}

/**
 * A finder for one text: give it an anchor and it returns where the quote
 * is, or null when the words are no longer there. When the quote appears
 * more than once, the place whose surrounding text is most like the
 * anchor's wins, and the first one on a tie. Build it once for a text and
 * reuse it for every comment.
 */
export function quoteLocator(text: string): (anchor: { quote: string; prefix?: string | undefined; suffix?: string | undefined }) => TextSpan | null {
  const whole = squeeze(text);
  return (anchor) => {
    const quote = squeeze(anchor.quote).text;
    if (!quote) return null;
    const prefix = squeeze(anchor.prefix ?? "").text;
    const suffix = squeeze(anchor.suffix ?? "").text;
    let best: { from: number; score: number } | null = null;
    for (const from of occurrences(whole.text, quote)) {
      const score = sharedEnd(whole.text.slice(Math.max(0, from - prefix.length), from), prefix) + sharedStart(whole.text.slice(from + quote.length, from + quote.length + suffix.length), suffix);
      if (!best || score > best.score) best = { from, score };
    }
    if (!best) return null;
    const start = whole.at[best.from];
    const last = whole.at[best.from + quote.length - 1];
    return start === undefined || last === undefined ? null : { start, end: last + 1 };
  };
}

/** Where an anchor's quote is in `text`, or null when the words are no longer there. */
export function locateQuote(text: string, anchor: { quote: string; prefix?: string | undefined; suffix?: string | undefined }): TextSpan | null {
  return quoteLocator(text)(anchor);
}

/**
 * The anchor for a stretch of `text` (a selection): its words on one line,
 * cut to the longest quote kept, and the text on both sides. Null when the
 * stretch holds no words.
 */
export function anchorAt(text: string, span: TextSpan): CommentAnchor | null {
  const start = Math.max(0, Math.min(span.start, span.end));
  const end = Math.min(text.length, Math.max(span.start, span.end));
  const quote = oneLine(text.slice(start, end)).slice(0, QUOTE_MAX_LENGTH).trimEnd();
  if (!quote) return null;
  return {
    quote,
    prefix: oneLine(text.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH * 2), start)).slice(-ANCHOR_CONTEXT_LENGTH),
    suffix: oneLine(text.slice(end, end + ANCHOR_CONTEXT_LENGTH * 2)).slice(0, ANCHOR_CONTEXT_LENGTH),
  };
}

/**
 * An anchor as it is stored: each part on one line and within its length.
 * Null when there is no quote left; a new comment with such an anchor is
 * refused (anchorToStore), never saved without a place.
 */
export function storedAnchor(anchor: { quote: string; prefix?: string | undefined; suffix?: string | undefined }): CommentAnchor | null {
  const quote = oneLine(anchor.quote).slice(0, QUOTE_MAX_LENGTH).trimEnd();
  if (!quote) return null;
  return {
    quote,
    prefix: oneLine(anchor.prefix ?? "").slice(-ANCHOR_CONTEXT_LENGTH),
    suffix: oneLine(anchor.suffix ?? "").slice(0, ANCHOR_CONTEXT_LENGTH),
  };
}

/**
 * The anchor for a quote alone (an agent names only the words): found in
 * `text`, with the text around its first place. Null when the words are not
 * in the text.
 */
export function anchorForQuote(text: string, quote: string): CommentAnchor | null {
  const span = locateQuote(text, { quote });
  if (!span) return null;
  const anchor = anchorAt(text, span);
  // Keep the words as they were given: they match the same place, and the writer reads back what they sent.
  return anchor ? { ...anchor, quote: storedAnchor({ quote })?.quote ?? anchor.quote } : null;
}
