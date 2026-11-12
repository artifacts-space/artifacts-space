"use client";

import { autoUpdate, computePosition, offset, shift, size, type VirtualElement } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from "react";

import { choosePlacement, menuEdge, menuMaxHeight, menuMinHeight, type PlacementRule } from "./menu-placement";

/** Where a menu opens: beside an element (the grip), or at a point inside one (a right-click), so it follows the page as it scrolls. */
export type MenuAnchor = { kind: "element"; element: HTMLElement } | { kind: "point"; element: HTMLElement; dx: number; dy: number };

/** The element floating-ui places the menu against. */
function referenceFor(anchor: MenuAnchor | HTMLElement): HTMLElement | VirtualElement {
  if (anchor instanceof HTMLElement) return anchor;
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

/**
 * Keeps a menu `gap` from its anchor, `menuEdge` inside the window, and no
 * taller than the window allows. There is no flip: a menu slides up or down
 * to stay inside and never jumps above or below its anchor.
 */
function middleware(gap: number) {
  return [
    offset(gap),
    shift({ padding: menuEdge }),
    size({
      padding: menuEdge,
      apply: ({ availableHeight, elements }) => {
        elements.floating.style.maxHeight = `${String(Math.max(menuMinHeight, Math.min(availableHeight, menuMaxHeight)))}px`;
      },
    }),
  ];
}

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
    // A placement still resolving when the effect ends must not put back the place the cleanup removed.
    let active = true;
    const update = () => {
      const placement = choosePlacement(rule, reference.getBoundingClientRect(), element.offsetWidth, document.documentElement.clientWidth);
      computePosition(reference, element, { strategy: "fixed", placement, middleware: middleware(rule.gap) })
        .then(({ x, y }) => {
          if (!active) return;
          element.style.left = `${String(x)}px`;
          element.style.top = `${String(y)}px`;
          element.dataset.placed = "";
        })
        .catch(() => undefined);
    };
    const stop = autoUpdate(reference, element, update);
    return () => {
      active = false;
      stop();
      // Off again (the phone sheet, or a new anchor): drop the old place so the sheet's own layout applies and the next place fades in again.
      element.style.removeProperty("left");
      element.style.removeProperty("top");
      element.style.removeProperty("max-height");
      delete element.dataset.placed;
    };
  }, [floating, anchor, rule, enabled]);
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
