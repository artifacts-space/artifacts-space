"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { quoteLocator, type CommentAnchor } from "@/lib/comments/anchor-rules";

import { indexText, rangeHasPoint, rangeOf } from "./dom-text";

/** The CSS highlight names (styled in globals.css): every inline comment's words, and the open one's. */
const MARK = "inline-comment";
const MARK_ACTIVE = "inline-comment-active";

/** The key of the comment being written, among the located anchors. */
export const DRAFT_KEY = "draft";

/** Words to find on the page, under a key: a comment id, or the draft. */
export interface AnchorToLocate {
  key: string;
  anchor: CommentAnchor;
}

/** The element that holds the document's words: the editor's content when there is one, else the read view. */
function textRoot(surface: HTMLElement): Element {
  return surface.querySelector("[data-comment-root]") ?? surface;
}

/** Draws the highlights: the open comment's words stand out from the rest. Browsers without CSS highlights draw none. */
function paint(ranges: ReadonlyMap<string, Range>, activeKey: string | null) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const active: Range[] = [];
  const rest: Range[] = [];
  for (const [key, range] of ranges) (key === activeKey ? active : rest).push(range);
  CSS.highlights.set(MARK, new Highlight(...rest));
  CSS.highlights.set(MARK_ACTIVE, new Highlight(...active));
}

function clearPaint() {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  CSS.highlights.delete(MARK);
  CSS.highlights.delete(MARK_ACTIVE);
}

/** Where each anchor's words are on the page now. */
function locate(surface: HTMLElement, anchors: readonly AnchorToLocate[]): Map<string, Range> {
  const found = new Map<string, Range>();
  if (anchors.length === 0) return found;
  const index = indexText(textRoot(surface));
  const find = quoteLocator(index.text);
  for (const { key, anchor } of anchors) {
    const span = find(anchor);
    const range = span ? rangeOf(index, span) : null;
    if (range) found.set(key, range);
  }
  return found;
}

function sameKeys(left: ReadonlySet<string>, right: ReadonlyMap<string, Range>): boolean {
  if (left.size !== right.size) return false;
  for (const key of right.keys()) if (!left.has(key)) return false;
  return true;
}

/**
 * Finds each anchor's words in the surface's text, highlights them, and
 * finds them again whenever the text changes (typing, a save from elsewhere,
 * the editor replacing the read view). It reads the page and never changes
 * it: the highlights are CSS highlights, not elements.
 */
export function useLocatedAnchors(surface: HTMLElement | null, anchors: readonly AnchorToLocate[], activeKey: string | null) {
  const ranges = useRef<ReadonlyMap<string, Range>>(new Map());
  const active = useRef(activeKey);
  const [located, setLocated] = useState<ReadonlySet<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    active.current = activeKey;
    paint(ranges.current, activeKey);
  }, [activeKey]);

  useEffect(() => {
    if (!surface) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      const found = locate(surface, anchors);
      ranges.current = found;
      paint(found, active.current);
      setLocated((previous) => (sameKeys(previous, found) ? previous : new Set(found.keys())));
      setReady(true);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(run);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(surface, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
      ranges.current = new Map();
      clearPaint();
    };
  }, [surface, anchors]);

  /** The box on screen of one anchor's words, or null when they are not on the page. */
  const boxOf = useCallback((key: string): DOMRect | null => ranges.current.get(key)?.getBoundingClientRect() ?? null, []);

  /** Scrolls one anchor's words into view. False when they are not on the page. */
  const scrollTo = useCallback((key: string): boolean => {
    const range = ranges.current.get(key);
    const element = range?.startContainer.parentElement;
    if (!range || !element) return false;
    element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return true;
  }, []);

  /** The keys whose words are at a point on screen, shortest stretch first, so a comment inside another's words wins. */
  const keysAt = useCallback((x: number, y: number): string[] => {
    const hits: { key: string; length: number }[] = [];
    for (const [key, range] of ranges.current) {
      if (key !== DRAFT_KEY && rangeHasPoint(range, x, y)) hits.push({ key, length: range.toString().length });
    }
    return hits.sort((left, right) => left.length - right.length).map((hit) => hit.key);
  }, []);

  return { located, ready, boxOf, scrollTo, keysAt };
}
