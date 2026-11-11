"use client";

import { useSyncExternalStore } from "react";

/*
 * "Comment" in the block menu hands a quote to the artifact's comments:
 * the thread under the artifact page, or the Comments dialog in /app. Until
 * inline comments ship, the quote goes into a new comment, ready to finish.
 * One pending quote per artifact; the thread takes it once.
 */

const QUOTE_CHARS = 280;

const pending = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The start of a new comment that quotes a block: its text as a Markdown
 * quote, cut at 280 characters, and a link back to the block.
 */
export function quotedCommentBody(text: string, link: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const quote = flat.length > QUOTE_CHARS ? `${flat.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : flat;
  const lines = [quote ? `> ${quote}` : null, `> [Go to this block](${link})`].filter((line): line is string => line !== null);
  return `${lines.join("\n>\n")}\n\n`;
}

/** Asks the artifact's comments to open with a new comment that starts with `body`. */
export function requestQuotedComment(publicId: string, body: string): void {
  pending.set(publicId, body);
  notify();
}

/** Takes the pending quote for an artifact, so it is used once. */
export function takeQuotedComment(publicId: string): string | null {
  const body = pending.get(publicId) ?? null;
  if (body === null) return null;
  pending.delete(publicId);
  notify();
  return body;
}

/** The quote waiting for this artifact's comments, or null. */
export function usePendingQuote(publicId: string): string | null {
  return useSyncExternalStore(subscribe, () => pending.get(publicId) ?? null, () => null);
}
