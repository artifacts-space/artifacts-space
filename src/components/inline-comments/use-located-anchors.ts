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

/** The two highlights one surface drew, so it only ever takes away its own. */
interface Painted {
  marked: Highlight;
  active: Highlight;
}

function canPaint(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/** Draws the highlights: the open comment's words stand out from the rest. Browsers without CSS highlights draw none. */
function paint(ranges: ReadonlyMap<string, Range>, activeKey: string | null): Painted | null {
  if (!canPaint()) return null;
  const active: Range[] = [];
  const rest: Range[] = [];
  for (const [key, range] of ranges) (key === activeKey ? active : rest).push(range);
  const painted = { marked: new Highlight(...rest), active: new Highlight(...active) };
  CSS.highlights.set(MARK, painted.marked);
  CSS.highlights.set(MARK_ACTIVE, painted.active);
  return painted;
}

/** Takes away the highlights this surface drew, unless another surface has drawn its own since. */
function clearPaint(painted: Painted | null) {
  if (!painted || !canPaint()) return;
  if (CSS.highlights.get(MARK) === painted.marked) CSS.highlights.delete(MARK);
  if (CSS.highlights.get(MARK_ACTIVE) === painted.active) CSS.highlights.delete(MARK_ACTIVE);
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

/** How long the text rests before the words are found again. Between passes each highlight follows its words by itself. */
const RELOCATE_AFTER_MS = 150;

const NONE_LOCATED: ReadonlySet<string> = new Set();

/**
 * Finds each anchor's words in the surface's text, highlights them, and
 * finds them again once the text changed and rests (typing, a save from
 * elsewhere, the editor replacing the read view). Reading the whole text on
 * every keystroke would slow typing in a long document, and is not needed:
 * a highlight is a live range, so it moves with its words between passes.
 * It reads the page and never changes it: the highlights are CSS
 * highlights, not elements.
 */
export function useLocatedAnchors(surface: HTMLElement | null, anchors: readonly AnchorToLocate[], activeKey: string | null) {
  const ranges = useRef<ReadonlyMap<string, Range>>(new Map());
  const painted = useRef<Painted | null>(null);
  const active = useRef(activeKey);
  const [located, setLocated] = useState<ReadonlySet<string>>(NONE_LOCATED);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    active.current = activeKey;
    painted.current = paint(ranges.current, activeKey);
  }, [activeKey]);

  // The highlights stay while the anchors change (a reload), so they do not blink; they go only with the surface.
  useEffect(() => {
    if (!surface) return;
    return () => {
      ranges.current = new Map();
      clearPaint(painted.current);
      painted.current = null;
    };
  }, [surface]);

  useEffect(() => {
    if (!surface) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      frame = 0;
      const found = locate(surface, anchors);
      ranges.current = found;
      painted.current = paint(found, active.current);
      setLocated((previous) => (sameKeys(previous, found) ? previous : new Set(found.keys())));
      setReady(true);
    };
    const whenTextRests = () => {
      clearTimeout(timer);
      timer = setTimeout(run, RELOCATE_AFTER_MS);
    };
    frame = requestAnimationFrame(run);
    const observer = new MutationObserver(whenTextRests);
    observer.observe(surface, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      if (frame !== 0) cancelAnimationFrame(frame);
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

  // Without a surface (the source view is open) nothing is on the page, and nothing is known about the words.
  return { located: surface ? located : NONE_LOCATED, ready: surface !== null && ready, boxOf, scrollTo, keysAt };
}
