"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";

import { revealScrollLeft, stripFades } from "@/lib/ui/tab-strip";
import { cn } from "@/lib/utils";

const tabSelector = '[role="tab"]';

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scrolls `strip` so `tab` shows in full, clear of the edge fades. */
function revealTab(strip: HTMLElement, tab: HTMLElement, behavior: ScrollBehavior) {
  const stripBox = strip.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  const start = tabBox.left - stripBox.left + strip.scrollLeft;
  const target = revealScrollLeft({ start, end: start + tabBox.width }, { scrollLeft: strip.scrollLeft, clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth });
  if (target !== null) strip.scrollTo({ left: target, behavior });
}

/** Tracks which edges of `strip` hide tabs, from scroll and resize events. */
function useEdgeFades(strip: RefObject<HTMLDivElement | null>) {
  const [fades, setFades] = useState({ start: false, end: false });
  useEffect(() => {
    const element = strip.current;
    if (!element) return undefined;
    const update = () => {
      const next = stripFades(element);
      setFades((current) => (current.start === next.start && current.end === next.end ? current : next));
    };
    update();
    const active = element.querySelector<HTMLElement>(`${tabSelector}[data-active]`);
    if (active) revealTab(element, active, "instant");
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [strip]);
  return fades;
}

/**
 * A tab row that never clips its labels. When the tabs fit, they show in
 * full. When they do not, the row scrolls sideways inside itself with a fade
 * on each edge that hides tabs, and the focused or clicked tab scrolls into
 * view, so arrow keys reach every tab.
 */
export function TabStrip({ children, className }: { children: ReactNode; className?: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const fades = useEdgeFades(strip);

  function reveal(event: SyntheticEvent<HTMLDivElement>) {
    const element = strip.current;
    const tab = event.target instanceof Element ? event.target.closest(tabSelector) : null;
    if (!element || !(tab instanceof HTMLElement)) return;
    revealTab(element, tab, prefersReducedMotion() ? "instant" : "smooth");
  }

  return (
    <div
      ref={strip}
      data-tabs-scroller=""
      data-fade-start={fades.start ? "" : undefined}
      data-fade-end={fades.end ? "" : undefined}
      onFocus={reveal}
      onClick={reveal}
      className={cn(
        "overflow-x-auto overscroll-x-contain [scrollbar-width:thin]",
        "data-fade-start:mask-l-from-[calc(100%-2rem)] data-fade-end:mask-r-from-[calc(100%-2rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
