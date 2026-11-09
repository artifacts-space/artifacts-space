"use client";

import { createContext, type ReactNode, type RefObject, useContext, useLayoutEffect, useState } from "react";

import { sheetFillMaxHeight } from "@/lib/sheet-grid-rules";

const SheetFillContext = createContext(false);

/** Where the grid usually starts on an artifact page (header, padding, and heading), used until the browser measures it. */
const typicalTop = 360;

/**
 * Marks the artifact's own page: a sheet grid inside fills the window down
 * to its bottom edge (sheetFillMaxHeight) instead of the fixed cap it has in
 * galleries and the /app pane.
 */
export function SheetFill({ children }: { children: ReactNode }) {
  return <SheetFillContext value>{children}</SheetFillContext>;
}

/**
 * The grid's tallest size as a CSS length when it fills the page, or null
 * elsewhere. It follows the grid's distance from the top of the document,
 * which changes when the heading or cover above it does, and nothing else,
 * so a phone's address bar showing and hiding never resizes it.
 */
export function useSheetFillHeight(ref: RefObject<HTMLElement | null>): string | null {
  const fills = useContext(SheetFillContext);
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!fills || !element) return;
    const update = () => { setTop(Math.round(element.getBoundingClientRect().top + window.scrollY)); };
    update();
    // Anything above the grid that changes size also changes the page's size.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [fills, ref]);

  if (!fills) return null;
  return sheetFillMaxHeight(top ?? typicalTop);
}
