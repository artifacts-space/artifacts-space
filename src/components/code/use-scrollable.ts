"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element's content overflows it, so only a block that
 * actually scrolls becomes a keyboard tab stop.
 */
export function useScrollable(ref: RefObject<HTMLElement | null>): boolean {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => { setScrollable(element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => { observer.disconnect(); };
  }, [ref]);

  return scrollable;
}
