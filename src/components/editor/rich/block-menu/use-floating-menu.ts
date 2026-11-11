"use client";

import { autoUpdate, computePosition, flip, offset, shift, size, type Placement, type VirtualElement } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from "react";

/** Where a menu opens: beside an element (the grip), or at a point inside one (a right-click), so it follows the page as it scrolls. */
export type MenuAnchor = { kind: "element"; element: HTMLElement } | { kind: "point"; element: HTMLElement; dx: number; dy: number };

/** The element floating-ui places the menu against. */
function referenceFor(anchor: MenuAnchor): HTMLElement | VirtualElement {
  if (anchor.kind === "element") return anchor.element;
  const { element, dx, dy } = anchor;
  return {
    contextElement: element,
    getBoundingClientRect: () => {
      const box = element.getBoundingClientRect();
      return new DOMRect(box.left + dx, box.top + dy, 0, 0);
    },
  };
}

/** Keeps a menu on screen and no taller than the room it has. */
function middleware(fallbacks: Placement[]) {
  return [
    offset(6),
    flip({ fallbackPlacements: fallbacks, padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply: ({ availableHeight, elements }) => {
        elements.floating.style.maxHeight = `${String(Math.max(160, Math.min(availableHeight, 560)))}px`;
      },
    }),
  ];
}

/**
 * Places a floating menu against its anchor and keeps it there while the
 * page scrolls or resizes. The menu stays hidden (`data-placed` unset) until
 * it has its first position. Off while `enabled` is false (the phone sheet).
 */
export function useFloatingMenu(floating: RefObject<HTMLElement | null>, anchor: MenuAnchor | HTMLElement | null, placement: Placement, enabled: boolean) {
  useLayoutEffect(() => {
    const element = floating.current;
    if (!enabled || !element || !anchor) return;
    const reference = anchor instanceof HTMLElement ? anchor : referenceFor(anchor);
    const fallbacks: Placement[] = placement.startsWith("left") ? ["right-start", "bottom-start", "top-start"] : ["left-start", "bottom-start", "top-start"];
    const update = () => {
      computePosition(reference, element, { strategy: "fixed", placement, middleware: middleware(fallbacks) })
        .then(({ x, y }) => {
          element.style.left = `${String(x)}px`;
          element.style.top = `${String(y)}px`;
          element.dataset.placed = "";
        })
        .catch(() => undefined);
    };
    return autoUpdate(reference, element, update);
  }, [floating, anchor, placement, enabled]);
}

/** Closes a menu on a press anywhere outside the given elements. */
export function usePressOutside(inside: readonly RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inside.some((ref) => ref.current?.contains(target))) return;
      onOutside();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => { document.removeEventListener("pointerdown", onPointerDown, true); };
  }, [inside, onOutside]);
}

const phoneQuery = "(max-width: 639px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", onChange);
  return () => { query.removeEventListener("change", onChange); };
}

/** True on phone-width screens, where menus open as a sheet from the bottom. */
export function usePhoneSheet(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(phoneQuery).matches, () => false);
}

/** True when the device can hover (a mouse or trackpad): the menu's search takes focus as it opens. */
export function canHover(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
