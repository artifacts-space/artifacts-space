"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

import type { Size } from "@/lib/canvas/view-rules";

/** How the viewer lays frames out: not read yet, a pannable board, or stacked in the page column. */
export type BoardMode = "measuring" | "board" | "stacked";

/**
 * The custom property the board window's styles set to "board" in a wide
 * column and "stacked" in a narrow one. The styles decide, by a container
 * query, so the page is laid out the same before and after scripts run; the
 * script reads the answer here and never works it out a second way.
 */
export const boardModeProperty = "--canvas-mode";

/** What the script knows about the board window: its mode, and its size while it is a board. */
export interface BoardWindow {
  mode: BoardMode;
  /** The window's size in board mode. Null until read, and while frames are stacked (nothing needs it then). */
  size: Size | null;
}

function sameWindow(a: BoardWindow, b: BoardWindow): boolean {
  return a.mode === b.mode && a.size?.width === b.size?.width && a.size?.height === b.size?.height;
}

function readWindow(element: HTMLElement): BoardWindow {
  const mode = getComputedStyle(element).getPropertyValue(boardModeProperty).trim() === "board" ? "board" : "stacked";
  return { mode, size: mode === "board" ? { width: element.clientWidth, height: element.clientHeight } : null };
}

/**
 * The board window's mode and size, read before the first paint and kept
 * current as the page column changes.
 */
export function useBoardWindow(windowRef: RefObject<HTMLElement | null>): BoardWindow {
  const [state, setState] = useState<BoardWindow>({ mode: "measuring", size: null });
  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    const measure = () => {
      const next = readWindow(element);
      setState((current) => (sameWindow(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [windowRef]);
  return state;
}

/** Marks the frame bodies the board measures. The value is the frame's id. */
export const frameBodyAttribute = "data-canvas-frame-body";

function sameHeights(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Each frame's drawn height at 100%, by frame id, for the board: read before
 * the first paint, so the board is fitted to the real heights the first time
 * it shows, and kept current as content inside a frame grows or shrinks. A
 * transform never changes these numbers. `frameKey` changes when the set of
 * frames does. Stacked frames need no heights (the page lays them out), so
 * nothing is read while `enabled` is false.
 */
export function useFrameHeights(windowRef: RefObject<HTMLElement | null>, frameKey: string, enabled: boolean): Readonly<Record<string, number>> {
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element || !enabled) return;
    const bodies = [...element.querySelectorAll<HTMLElement>(`[${frameBodyAttribute}]`)];
    const measure = () => {
      const next = Object.fromEntries(bodies.map((body) => [body.getAttribute(frameBodyAttribute) ?? "", body.offsetHeight]));
      setHeights((current) => (sameHeights(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const body of bodies) observer.observe(body);
    return () => {
      observer.disconnect();
    };
  }, [windowRef, frameKey, enabled]);
  return heights;
}
