"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject, type UIEvent } from "react";

import { fitView, frameView, keepInWindow, nextZoomStep, panBy, wheelZoom, zoomAbout, type BoardView, type Box, type Size } from "@/lib/canvas/view-rules";

import { usePinch } from "./use-pinch";

/** Controls a drag never starts on: the reader is using them, not moving the board. */
const interactive = "a, button, input, select, textarea, label, summary, [role='button'], [role='tab'], [role='slider'], [role='switch'], [role='checkbox'], [role='combobox'], [contenteditable='true'], [data-canvas-toolbar]";

/** How far the pointer moves before a press becomes a drag, so a click stays a click. */
const dragThreshold = 4;

const arrowSteps: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

interface Press {
  pointerId: number;
  x: number;
  y: number;
  view: BoardView;
  dragging: boolean;
}

/** What the board needs to draw itself and react to the reader. */
export interface PanZoom {
  /** The view to draw: fitted to the frames until the reader moves the board. */
  view: BoardView;
  /** True while a drag is under way. */
  dragging: boolean;
  /** True when the next change of view should glide (a button), false when it should track the hand (a drag, the wheel). */
  glide: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  actualSize: () => void;
  fit: () => void;
  /** Shows one frame: `box` is its place on the board. */
  showFrame: (box: Box) => void;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onScroll: (event: UIEvent<HTMLElement>) => void;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
  };
}

/** True while the board's world still moves toward the view (a button's glide, a CSS transition). */
function isGliding(pane: HTMLElement): boolean {
  return (pane.querySelector("[data-canvas-world]")?.getAnimations().length ?? 0) > 0;
}

/** How many frames the board waits for a glide to end before it gives up bringing the focused control into view. */
const REVEAL_FRAMES = 30;

/**
 * Brings the focused control inside `pane` into view once the board is drawn at rest. It waits, a frame at a time,
 * for the glide to end, then asks the browser to scroll to the control; the board turns that scroll into a pan.
 * One wait runs at a time (`pending` holds its frame), and it ends when the focus leaves the board.
 */
function revealFocusedAtRest(pane: HTMLElement, pending: { frame: number | null }, left = REVEAL_FRAMES) {
  if (pending.frame !== null) cancelAnimationFrame(pending.frame);
  pending.frame = requestAnimationFrame(() => {
    pending.frame = null;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === pane || !pane.contains(focused)) return;
    if (isGliding(pane) && left > 0) {
      revealFocusedAtRest(pane, pending, left - 1);
      return;
    }
    focused.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function startsOnControl(event: PointerEvent<HTMLElement>): boolean {
  return event.target instanceof Element && event.target.closest(interactive) !== null;
}

/**
 * Pan and zoom for the board window. The view follows "Fit" until the reader
 * drags, zooms, or picks a frame; Fit puts it back. Dragging pans, except
 * from a control inside a frame (a middle-button drag pans from anywhere).
 * Ctrl or ⌘ with the wheel zooms about the pointer; a plain wheel is left
 * alone, so the page still scrolls. Two fingers zoom about the point between
 * them (`usePinch`). With the board itself focused, arrow keys pan, plus and
 * minus zoom, and 0 fits. When focus moves to a control outside the window,
 * the board pans to it. A drag ends when the pointer lifts, when the browser
 * takes the pointer or its capture away, and when the window loses focus,
 * so the board never keeps following a pointer that is no longer pressed.
 * `enabled` is false while frames are stacked in the page column.
 */
export function usePanZoom(windowRef: RefObject<HTMLElement | null>, bounds: Box | null, size: Size | null, enabled: boolean): PanZoom {
  const [moved, setMoved] = useState<BoardView | null>(null);
  const [dragging, setDragging] = useState(false);
  const [glide, setGlide] = useState(false);
  const press = useRef<Press | null>(null);
  const reveal = useRef<{ frame: number | null }>({ frame: null });
  useEffect(() => {
    const pending = reveal.current;
    return () => { if (pending.frame !== null) cancelAnimationFrame(pending.frame); };
  }, []);
  const room = size ?? { width: 0, height: 0 };
  const view = moved ?? fitView(bounds, room);
  const latest = useRef({ view, bounds, room });
  useEffect(() => {
    latest.current = { view, bounds, room };
  });

  const move = useCallback((next: BoardView, smooth: boolean) => {
    setGlide(smooth);
    setMoved({ zoom: next.zoom, x: Math.round(next.x), y: Math.round(next.y) });
  }, []);

  // A zoom keeps one point still and moves the rest, so it can push the whole board out of the window as a drag could. It goes through the drag's clamp.
  const zoomed = useCallback((next: BoardView, smooth: boolean) => {
    move(keepInWindow(next, latest.current.bounds, latest.current.room), smooth);
  }, [move]);

  const zoomTo = useCallback((zoom: (current: number) => number) => {
    const { view: current, room: window } = latest.current;
    zoomed(zoomAbout(current, { x: window.width / 2, y: window.height / 2 }, zoom(current.zoom)), true);
  }, [zoomed]);

  useEffect(() => {
    const element = windowRef.current;
    if (!element || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const { view: current } = latest.current;
      zoomed(zoomAbout(current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, wheelZoom(current.zoom, event.deltaY)), false);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [windowRef, enabled, zoomed]);

  const pinch = usePinch(windowRef, enabled, () => latest.current.view, (next) => { zoomed(next, false); });

  const endDrag = useCallback(() => {
    press.current = null;
    setDragging(false);
  }, []);

  // A window that loses focus mid-drag (another app, a system dialog) may never send the pointer's release.
  const { reset: resetPinch } = pinch;
  useEffect(() => {
    if (!enabled) return;
    const onBlur = () => {
      endDrag();
      resetPinch();
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, endDrag, resetPinch]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || (event.button !== 0 && event.button !== 1)) return;
    // A second finger turns the gesture into a pinch; the first finger's drag ends.
    if (pinch.down(event)) {
      endDrag();
      return;
    }
    if (event.button === 0 && startsOnControl(event)) return;
    // A middle press would otherwise start the browser's own autoscroll.
    if (event.button === 1) event.preventDefault();
    press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: latest.current.view, dragging: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (pinch.move(event)) return;
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    const delta = { x: event.clientX - current.x, y: event.clientY - current.y };
    if (!current.dragging) {
      if (Math.hypot(delta.x, delta.y) < dragThreshold) return;
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
      setDragging(true);
    }
    move(panBy(current.view, delta, latest.current.bounds, latest.current.room), false);
  };

  // The pointer lifted, the browser took it for its own gesture, or its capture was lost: each ends the press.
  const endPress = (event: PointerEvent<HTMLElement>) => {
    pinch.end(event.pointerId);
    if (press.current?.pointerId === event.pointerId) endDrag();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!enabled || event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const arrow = arrowSteps[event.key];
    const distance = event.shiftKey ? 320 : 80;
    const action = arrow
      ? () => { move(panBy(latest.current.view, { x: arrow.x * distance, y: arrow.y * distance }, latest.current.bounds, latest.current.room), true); }
      : keyActions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  // Focus moving to a control outside the window (Tab) makes the browser scroll the window, even though it shows no scrollbars. Turn that scroll into a pan, so the control comes into view and the view stays the one source of the board's place.
  // While a glide runs, the browser measures that scroll against the board as it is drawn at that moment, not where
  // the view comes to rest, so the pan would leave the control off by what the glide had left. The pan ends the
  // glide; once the board is drawn at rest, the focused control is brought into view again, and that scroll is exact.
  const onScroll = (event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const { scrollLeft, scrollTop } = element;
    if (scrollLeft === 0 && scrollTop === 0) return;
    const gliding = isGliding(element);
    element.scrollLeft = 0;
    element.scrollTop = 0;
    const current = latest.current.view;
    move({ zoom: current.zoom, x: current.x - scrollLeft, y: current.y - scrollTop }, false);
    if (gliding) revealFocusedAtRest(element, reveal.current);
  };

  // The browser took the pointer for its own gesture: a one-finger swipe that turned out to scroll the page. Any pan it caused before that is undone, so scrolling past the board never nudges it.
  const cancelPress = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId === event.pointerId && current.dragging) move(current.view, false);
    endPress(event);
  };

  // An image or a link would otherwise start the browser's own drag and end ours.
  const onDragStart = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  };

  const zoomIn = () => { zoomTo((zoom) => nextZoomStep(zoom, 1)); };
  const zoomOut = () => { zoomTo((zoom) => nextZoomStep(zoom, -1)); };
  const fit = () => {
    setGlide(true);
    setMoved(null);
  };
  const keyActions: Readonly<Record<string, (() => void) | undefined>> = { "+": zoomIn, "=": zoomIn, "-": zoomOut, "0": fit };

  return {
    view,
    dragging,
    glide,
    zoomIn,
    zoomOut,
    actualSize: () => { zoomTo(() => 1); },
    fit,
    showFrame: (box) => { move(frameView(box, latest.current.room), true); },
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPress, onPointerCancel: cancelPress, onLostPointerCapture: endPress, onKeyDown, onScroll, onDragStart },
  };
}
