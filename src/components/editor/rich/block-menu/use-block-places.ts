"use client";

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import type { HandlePlace } from "./block-handle";
import { blockTargetAt, documentBlocks, isListItem } from "./block-target";

/** The editor's current state, re-read on every transaction. */
export function useEditorState(editor: Editor): EditorState {
  return useSyncExternalStore(
    (onChange) => {
      editor.on("transaction", onChange);
      return () => { editor.off("transaction", onChange); };
    },
    () => editor.state,
    () => editor.state,
  );
}

/** How far left of `frame` the page lets something show before a scrolling or clipping box cuts it off. */
function roomOnLeft(frame: HTMLElement): number {
  const left = frame.getBoundingClientRect().left;
  let edge = 0;
  for (let element = frame.parentElement; element; element = element.parentElement) {
    if (getComputedStyle(element).overflowX !== "visible") edge = Math.max(edge, element.getBoundingClientRect().left);
  }
  return Math.max(0, left - edge);
}

/** Where the first line of text in a node starts, or null for nodes without text (dividers, media). */
function firstTextPos(node: PMNode, pos: number): number | null {
  if (node.isTextblock) return pos + 1;
  let found: number | null = null;
  node.descendants((child, offset) => {
    if (found !== null) return false;
    if (!child.isTextblock) return true;
    found = pos + 1 + offset + 1;
    return false;
  });
  return found;
}

/** The top and bottom of a block's first line, or of its top 28px when it has no text. */
function firstLine(view: EditorView, node: PMNode, pos: number, box: DOMRect): { top: number; bottom: number } {
  const text = firstTextPos(node, pos);
  if (text !== null) {
    try {
      const coords = view.coordsAtPos(text);
      return { top: coords.top, bottom: coords.bottom };
    } catch {
      // Positions inside a node view the editor cannot measure fall back to the box.
    }
  }
  return { top: box.top, bottom: box.top + Math.min(box.height, 28) };
}

/** Where the handle for the block at `pos` goes, relative to `frame`. Null when the block has no element. */
function measure(view: EditorView, frame: HTMLElement, pos: number, room: number): HandlePlace | null {
  const node = view.state.doc.nodeAt(pos);
  const element = view.nodeDOM(pos);
  if (!node || !(element instanceof HTMLElement)) return null;
  const box = element.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  const line = firstLine(view, node, pos, box);
  // A list item's handle sits left of its bullet, at the list's edge.
  const list = isListItem(node) ? element.parentElement?.getBoundingClientRect() : undefined;
  const left = Math.min(box.left, list?.left ?? box.left);
  return { pos, middle: (line.top + line.bottom) / 2 - origin.top, left: left - origin.left, room };
}

/** Measures each block's handle place, skipping blocks not in `shown` when it is set. */
function measureAll(view: EditorView, frame: HTMLElement, positions: readonly number[], shown: Set<Node> | null): HandlePlace[] {
  const room = roomOnLeft(frame);
  const measured: HandlePlace[] = [];
  for (const pos of positions) {
    const block = view.nodeDOM(pos);
    if (shown && (!block || !shown.has(block))) continue;
    const place = measure(view, frame, pos, room);
    if (place) measured.push(place);
  }
  return measured;
}

/** Bumps a counter when the editor or the window changes size, so handles are measured again. */
function useResizeTick(editor: Editor): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => { setTick((value) => value + 1); };
    const observer = new ResizeObserver(bump);
    observer.observe(editor.view.dom);
    window.addEventListener("resize", bump);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [editor]);
  return tick;
}

interface BlockWatch {
  observer: IntersectionObserver;
  observed: Set<Element>;
}

/** The element of every block that gets a handle. */
function blockElements(view: EditorView, doc: PMNode): Set<Element> {
  const elements = new Set<Element>();
  for (const block of documentBlocks(doc)) {
    const element = view.nodeDOM(block.pos);
    if (element instanceof Element) elements.add(element);
  }
  return elements;
}

/**
 * Observes the blocks not yet observed and lets go of the ones gone. The
 * editor keeps the elements of blocks a change did not touch, so most
 * keystrokes observe nothing new.
 */
function watchBlocks(watch: BlockWatch, blocks: Set<Element>, seen: Set<Node> | null) {
  for (const element of watch.observed) {
    if (blocks.has(element)) continue;
    watch.observer.unobserve(element);
    watch.observed.delete(element);
    seen?.delete(element);
  }
  for (const element of blocks) {
    if (watch.observed.has(element)) continue;
    watch.observer.observe(element);
    watch.observed.add(element);
  }
}

/** How far beyond the screen a block still counts as on it, so handles are ready as it scrolls in. */
const SCREEN_MARGIN = "400px 0px";

/**
 * The block elements on or near the screen, kept by an IntersectionObserver
 * (null when `enabled` is off: every block counts). With a handle beside
 * every block on touch screens, only these are measured, so a keystroke in
 * a long document does not re-measure every block. The returned number
 * changes when blocks scroll in or out.
 */
function useBlocksOnScreen(editor: Editor, enabled: boolean, doc: PMNode): [RefObject<Set<Node> | null>, number] {
  const onScreen = useRef<Set<Node> | null>(null);
  const watch = useRef<BlockWatch | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const seen = new Set<Node>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target);
        else seen.delete(entry.target);
      }
      setTick((value) => value + 1);
    }, { rootMargin: SCREEN_MARGIN });
    onScreen.current = seen;
    watch.current = { observer, observed: new Set() };
    return () => {
      observer.disconnect();
      watch.current = null;
      onScreen.current = null;
    };
  }, [editor, enabled]);
  useEffect(() => {
    const current = watch.current;
    if (!current || editor.isDestroyed) return;
    watchBlocks(current, blockElements(editor.view, doc), onScreen.current);
  }, [editor, enabled, doc]);
  return [onScreen, tick];
}

/**
 * The handle places for the given block positions, measured after each
 * document change and resize (not on cursor moves). With `onlyOnScreen`
 * (a handle beside every block), only blocks on or near the screen.
 */
export function useBlockPlaces(editor: Editor, frame: RefObject<HTMLElement | null>, positions: readonly number[], doc: PMNode, onlyOnScreen = false): HandlePlace[] {
  const [places, setPlaces] = useState<HandlePlace[]>([]);
  const tick = useResizeTick(editor);
  const [onScreen, screenTick] = useBlocksOnScreen(editor, onlyOnScreen, doc);
  const key = positions.join(",");
  useLayoutEffect(() => {
    const element = frame.current;
    const update = () => {
      if (!element || editor.isDestroyed) return;
      setPlaces(measureAll(editor.view, element, key ? key.split(",").map(Number) : [], onScreen.current));
    };
    update();
  }, [editor, frame, key, doc, tick, onScreen, screenTick]);
  return places;
}

/** How far left of the document the pointer still counts as over a block: room for the handle. */
const HANDLE_BAND = 72;

/**
 * The block under the mouse, or null. The band left of the document, where
 * the handle sits, counts too, so moving onto the handle keeps it. Typing
 * hides the handle until the mouse moves again. Off on touch screens.
 */
export function useHoveredBlock(editor: Editor, enabled: boolean) {
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let point = { x: 0, y: 0 };
    const locate = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const box = editor.view.dom.getBoundingClientRect();
      const inside = point.y >= box.top && point.y <= box.bottom && point.x >= box.left - HANDLE_BAND && point.x <= box.right;
      if (!inside) {
        setHovered(null);
        return;
      }
      const found = editor.view.posAtCoords({ left: Math.min(Math.max(point.x, box.left + 1), box.right - 1), top: point.y });
      if (!found) return;
      setHovered(blockTargetAt(editor.state.doc, found.inside >= 0 ? found.inside : found.pos)?.pos ?? null);
    };
    const onMove = (event: MouseEvent) => {
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(locate);
    };
    const onTyped = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged) setHovered(null); };
    document.addEventListener("mousemove", onMove);
    editor.on("update", onTyped);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMove);
      editor.off("update", onTyped);
    };
  }, [editor, enabled]);
  return [hovered, setHovered] as const;
}
