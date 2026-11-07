"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** The custom property other sticky bars on the artifact page offset themselves by. */
export const CHROME_HEIGHT_VAR = "--artifact-chrome-height";

/**
 * Keeps the artifact page's header and sharing notice pinned to the top while
 * the reader scrolls. It publishes its height as a custom property on the
 * root element, so the editor bar sticks below it and anchor jumps land below
 * it instead of under it.
 */
export function StickyChrome({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () => {
      const height = `${String(element.offsetHeight)}px`;
      root.style.setProperty(CHROME_HEIGHT_VAR, height);
      root.style.scrollPaddingTop = height;
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(CHROME_HEIGHT_VAR);
      root.style.removeProperty("scroll-padding-top");
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {children}
    </div>
  );
}
