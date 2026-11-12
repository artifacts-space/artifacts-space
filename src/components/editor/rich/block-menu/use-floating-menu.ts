"use client";

import { autoUpdate, computePosition, offset, shift, size, type VirtualElement } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { choosePlacement, handleBox, menuEdge, menuGap, menuMinHeight, menuWidth, scrollForRoom, type PlacementRule } from "./menu-placement";

/**
 * Where a menu opens: beside a block's handle (with the block, read each
 * time the menu is placed so it is never stale), or at a point inside a
 * block (a right-click). Both follow the page as it scrolls.
 */
export type MenuAnchor =
  | { kind: "element"; element: HTMLElement; block?: () => HTMLElement | null }
  | { kind: "point"; element: HTMLElement; dx: number; dy: number };

/** The element floating-ui places the menu against. */
function referenceFor(anchor: MenuAnchor | HTMLElement): HTMLElement | VirtualElement {
  if (anchor instanceof HTMLElement) return anchor;
  const { element } = anchor;
  if (anchor.kind === "element") {
    const { block } = anchor;
    return {
      contextElement: element,
      getBoundingClientRect: () => {
        const box = handleBox(element.getBoundingClientRect(), block?.()?.getBoundingClientRect() ?? null, document.documentElement.clientHeight);
        return new DOMRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      },
    };
  }
  const { dx, dy } = anchor;
  return {
    contextElement: element,
    getBoundingClientRect: () => {
      const box = element.getBoundingClientRect();
      return new DOMRect(box.left + dx, box.top + dy, 0, 0);
    },
  };
}

/**
 * Keeps a menu on screen and no taller than the room it has. There is no
 * flip: a menu beside its anchor slides up or down to stay on screen and
 * never jumps above or below it.
 */
const middleware = [
  offset(menuGap),
  shift({ padding: menuEdge }),
  size({
    padding: menuEdge,
    apply: ({ availableHeight, elements }) => {
      elements.floating.style.maxHeight = `${String(Math.max(menuMinHeight, Math.min(availableHeight, 560)))}px`;
    },
  }),
];

/**
 * Places a floating menu against its anchor by `rule` and keeps it there
 * while the page scrolls or resizes. The menu stays transparent
 * (`data-placed` unset) until it has its first position, so it never shows
 * at the wrong spot. Off while `enabled` is false (the phone sheet).
 */
export function useFloatingMenu(floating: RefObject<HTMLElement | null>, anchor: MenuAnchor | HTMLElement | null, rule: PlacementRule, enabled: boolean) {
  useLayoutEffect(() => {
    const element = floating.current;
    if (!enabled || !element || !anchor) return;
    const reference = referenceFor(anchor);
    const update = () => {
      const placement = choosePlacement(rule, reference.getBoundingClientRect(), element.offsetWidth, document.documentElement.clientWidth);
      computePosition(reference, element, { strategy: "fixed", placement, middleware })
        .then(({ x, y }) => {
          element.style.left = `${String(x)}px`;
          element.style.top = `${String(y)}px`;
          element.dataset.placed = "";
        })
        .catch(() => undefined);
    };
    return autoUpdate(reference, element, update);
  }, [floating, anchor, rule, enabled]);
}

/**
 * Before a menu from a grip opens below its block (the left has no room),
 * scrolls the page so the menu fits under the block instead of past the
 * window's bottom edge. Called once from the click that opens the menu, so
 * it runs before the menu is placed. Returns true when the page moved.
 */
export function makeRoomBelow(anchor: MenuAnchor): boolean {
  if (anchor.kind !== "element" || window.matchMedia(phoneQuery).matches) return false;
  const root = document.documentElement;
  const block = anchor.block?.()?.getBoundingClientRect() ?? null;
  const by = scrollForRoom(anchor.element.getBoundingClientRect(), block, menuWidth, root.clientWidth, root.clientHeight);
  if (by <= 0) return false;
  window.scrollBy({ top: by, behavior: "instant" });
  return true;
}

/** A point in window coordinates. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** How far a click or the pointer must be from the opening press to count as a new one. */
const stillDistance = 3;

function near(point: MenuPoint, x: number, y: number): boolean {
  return Math.abs(x - point.x) + Math.abs(y - point.y) < stillDistance;
}

/**
 * After makeRoomBelow moved the page under a pointer that did not move, the
 * menu can open under the opening press. Until the pointer moves or a click
 * lands somewhere else, a click at that same spot (the second half of a
 * double-click on the grip, or a second tap) is swallowed, so it never runs
 * the row now under it. Mouse, pen, and touch alike: any click elsewhere
 * works at once. Spread the result onto the menu's panel.
 */
export function useSettling(still: MenuPoint | null): { onClickCapture: (event: ReactMouseEvent) => void } {
  const [at, setAt] = useState(still);
  useEffect(() => {
    if (!at) return;
    const onMove = (event: PointerEvent) => { if (!near(at, event.clientX, event.clientY)) setAt(null); };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); };
  }, [at]);
  return {
    onClickCapture: (event) => {
      if (!at) return;
      if (!near(at, event.clientX, event.clientY)) {
        setAt(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
  };
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
