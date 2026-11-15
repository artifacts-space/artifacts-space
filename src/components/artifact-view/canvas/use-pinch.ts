"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from "react";

import { pinchOf, pinchView, type BoardView, type Pinch, type Point } from "@/lib/canvas/view-rules";

/** The view and the fingers when a pinch began. */
interface PinchStart {
  view: BoardView;
  from: Pinch;
}

/** How the board's pointer handlers hand touches to the pinch. */
export interface PinchHandlers {
  /** Notes a finger going down. True when it is the second finger, and a pinch begins. */
  down: (event: PointerEvent<HTMLElement>) => boolean;
  /** Follows a finger. True while a pinch is under way, so the caller does not also drag. */
  move: (event: PointerEvent<HTMLElement>) => boolean;
  /** Forgets a finger that lifted, or that the browser took for its own gesture. */
  end: (pointerId: number) => void;
  /** Forgets every finger, when the page can no longer tell which are down. */
  reset: () => void;
}

/** Where a pointer is in the board's window, from the window's top left corner. */
function placeOf(event: PointerEvent<HTMLElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Two-finger zoom for the board. The fingers zoom the board about the point
 * between them and move it as they move together; the page itself never
 * zooms or scrolls under them. One finger is not this hook's: a vertical
 * swipe scrolls the page (the window's `touch-pan-y`), and a sideways drag
 * pans the board through the ordinary drag.
 */
export function usePinch(windowRef: RefObject<HTMLElement | null>, enabled: boolean, currentView: () => BoardView, onView: (view: BoardView) => void): PinchHandlers {
  const fingers = useRef(new Map<number, Point>());
  const start = useRef<PinchStart | null>(null);

  useEffect(() => {
    const element = windowRef.current;
    if (!element || !enabled) return;
    // Two fingers on the board belong to the board. Without this the browser could scroll the page with them and end the pinch.
    const keepGesture = (event: TouchEvent) => {
      const onBoard = [...event.touches].filter((touch) => touch.target instanceof Node && element.contains(touch.target));
      if (onBoard.length >= 2 && event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchstart", keepGesture, { passive: false });
    element.addEventListener("touchmove", keepGesture, { passive: false });
    return () => {
      element.removeEventListener("touchstart", keepGesture);
      element.removeEventListener("touchmove", keepGesture);
    };
  }, [windowRef, enabled]);

  /** The first two fingers down, as a pinch, or null with fewer than two. */
  const fingersNow = (): Pinch | null => {
    const [first, second] = [...fingers.current.values()];
    return first && second ? pinchOf(first, second) : null;
  };

  const down = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "touch") return false;
    fingers.current.set(event.pointerId, placeOf(event));
    const from = fingersNow();
    if (fingers.current.size !== 2 || !from) return false;
    start.current = { view: currentView(), from };
    return true;
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    if (!fingers.current.has(event.pointerId)) return false;
    fingers.current.set(event.pointerId, placeOf(event));
    const to = fingersNow();
    if (!start.current || !to) return false;
    onView(pinchView(start.current.view, start.current.from, to));
    return true;
  };

  const end = (pointerId: number) => {
    fingers.current.delete(pointerId);
    if (fingers.current.size < 2) start.current = null;
  };

  const reset = useCallback(() => {
    fingers.current.clear();
    start.current = null;
  }, []);

  return { down, move, end, reset };
}
