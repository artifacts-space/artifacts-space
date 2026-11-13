"use client";

import { useEffect, useRef } from "react";

/** The nearest ancestor that scrolls on its own (the Comments dialog's body, a card's list), or null. */
function scrollBoxOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

/**
 * For the comment a link asked for: centers it in the box that scrolls it
 * (never the page behind, which keeps the artifact where the link put it) and
 * moves focus to it, so a keyboard or a screen reader starts there. Runs when
 * the comment becomes the linked one. The element needs `tabIndex={-1}`.
 */
export function useLinkedCommentView<T extends HTMLElement>(linked: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!linked || !element) return;
    const box = scrollBoxOf(element);
    if (box) {
      const offset = element.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTop += offset - Math.max(0, (box.clientHeight - element.offsetHeight) / 2);
    }
    element.focus({ preventScroll: true });
  }, [linked]);
  return ref;
}
