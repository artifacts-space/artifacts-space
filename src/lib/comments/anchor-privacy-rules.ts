import { stripInlineMarkdown } from "@/lib/og/text-utils";

import { anchorAt, anchorForQuote, quoteLocator, type CommentAnchor } from "./anchor-rules";

/*
 * Which inline-comment quotes a viewer may read. A quote (and the text kept
 * around it) is a copy of artifact content. Readers outside the team of a
 * link or public artifact are served its approved version while the team
 * works on a newer one, so they get an anchor only when its words are in the
 * content they are served, and then with the surrounding text taken from
 * that content, never from the stored anchor (which may hold unapproved
 * words). Everyone served the latest version reads every anchor. Pure.
 */

/** What a viewer is served, for deciding which anchors they may read. */
export type ServedText = { source: "latest" } | { source: "approved"; content: string };

/** Decides, for one stored anchor, the anchor this viewer may read, or null. */
export type AnchorGate = (stored: CommentAnchor) => CommentAnchor | null;

/** A gate that shows no anchor: for viewers whose served content could not be loaded. */
export const hideAnchors: AnchorGate = () => null;

/** A list or task line's marks, a heading's hashes, and blockquote marks at the start of a line. */
const blockMarks = /^\s{0,3}(?:>\s?)*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/;

/**
 * Markdown as a reader sees it, line by line: block and inline marks
 * removed, link and image text kept. Quotes are made on rendered text, so
 * they match here across formatting marks the source has between the words.
 */
export function readableText(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) => stripInlineMarkdown(line.replace(blockMarks, "")))
    .join("\n");
}

/**
 * A finder over the content a viewer is served: give it an anchor and it
 * returns the anchor as that content holds it (the same quote, and the text
 * around its place in the content), or null when the words are not there.
 * It looks in the readable text first, then in the source.
 */
export function servedAnchorFinder(content: string): AnchorGate {
  const texts = [readableText(content), content].map((text) => ({ text, locate: quoteLocator(text) }));
  return (stored) => {
    for (const { text, locate } of texts) {
      const span = locate(stored);
      if (!span) continue;
      const around = anchorAt(text, span);
      return around ? { quote: stored.quote, prefix: around.prefix, suffix: around.suffix } : null;
    }
    return null;
  };
}

/**
 * The anchor gate for a viewer. Served the latest version: every anchor as
 * stored. Served an approved version: only anchors whose words are in that
 * version's content, with their surrounding text from it.
 */
export function anchorGate(served: ServedText): AnchorGate {
  if (served.source === "latest") return (stored) => stored;
  return servedAnchorFinder(served.content);
}

/** The anchor stored on a comment row, or null for a comment on the whole artifact. */
export function storedAnchorOf(record: { quote: string | null; quotePrefix: string | null; quoteSuffix: string | null }): CommentAnchor | null {
  if (!record.quote) return null;
  return { quote: record.quote, prefix: record.quotePrefix ?? "", suffix: record.quoteSuffix ?? "" };
}

/**
 * The anchor for words an agent quotes, found in the content it is served:
 * in the readable text first (agents quote words as they read, without
 * Markdown marks), then in the source. Null when the words are in neither.
 */
export function anchorForServedQuote(content: string, quote: string): CommentAnchor | null {
  return anchorForQuote(readableText(content), quote) ?? anchorForQuote(content, quote);
}

/**
 * Whether an inline comment sits on words that are no longer in the content
 * the viewer is served. A withheld anchor always counts; a shown one counts
 * when `find` (over the served content) no longer finds it, and never when
 * the content is unknown (null).
 */
export function textChanged(view: { anchored: boolean; anchor: CommentAnchor | null }, find: AnchorGate | null): boolean {
  if (!view.anchored) return false;
  if (view.anchor === null) return true;
  return find !== null && find(view.anchor) === null;
}
