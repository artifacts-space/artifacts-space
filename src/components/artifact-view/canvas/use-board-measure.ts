"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import type { Size } from "@/lib/canvas/view-rules";

/**
 * The board window's own size, measured before the first paint and kept
 * current as the page column changes. Null until the browser has measured it.
 */
export function useBoardSize(windowRef: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize((current) => (current?.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [windowRef]);
  return size;
}

/** Marks the frame bodies the board measures. The value is the frame's id. */
export const frameBodyAttribute = "data-canvas-frame-body";

function sameHeights(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Each frame's drawn height at 100%, by frame id, kept current as content
 * inside a frame grows or shrinks. A transform never changes these numbers.
 * `frameKey` changes when the set of frames does.
 */
export function useFrameHeights(windowRef: RefObject<HTMLElement | null>, frameKey: string): Readonly<Record<string, number>> {
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    const element = windowRef.current;
    if (!element) return;
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
  }, [windowRef, frameKey]);
  return heights;
}
