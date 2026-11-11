"use client";

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";

import type { HandlePlace } from "./block-handle";
import { blockTargetAt, isListItem } from "./block-target";

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

/** The handle places for the given block positions, measured after each document change and resize (not on cursor moves). */
export function useBlockPlaces(editor: Editor, frame: RefObject<HTMLElement | null>, positions: readonly number[], doc: PMNode): HandlePlace[] {
  const [places, setPlaces] = useState<HandlePlace[]>([]);
  const tick = useResizeTick(editor);
  const key = positions.join(",");
  useLayoutEffect(() => {
    const element = frame.current;
    const update = () => {
      if (!element || editor.isDestroyed) return;
      const room = roomOnLeft(element);
      setPlaces(key ? key.split(",").map((pos) => measure(editor.view, element, Number(pos), room)).filter((place) => place !== null) : []);
    };
    update();
  }, [editor, frame, key, doc, tick]);
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
