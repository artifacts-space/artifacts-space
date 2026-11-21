"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FocusEvent, type KeyboardEvent, type PointerEvent, type RefObject, type UIEvent } from "react";
import { flushSync } from "react-dom";

import { fitView, frameView, keepInWindow, nextZoomStep, panBy, panToReveal, wheelZoom, zoomAbout, type BoardView, type Box, type Size } from "@/lib/canvas/view-rules";

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
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onScroll: (event: UIEvent<HTMLElement>) => void;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
  };
}

/**
 * The moves of the board's world toward the view that still run (a button's glide, a CSS transition on the world
 * itself). Only the world's own animations count, never those of what the frames show: a spinner in a frame is no glide.
 */
function glidesOf(pane: HTMLElement): Animation[] {
  return pane.querySelector("[data-canvas-world]")?.getAnimations({ subtree: false }) ?? [];
}

/** True while the board's world still moves toward the view. */
function isGliding(pane: HTMLElement): boolean {
  return glidesOf(pane).length > 0;
}

/** The reveal that waits: the frame it runs in, and its turn, so a wait that a newer reveal replaced does nothing. */
interface PendingReveal {
  frame: number | null;
  turn: number;
}

/**
 * Brings the focused control inside `pane` into view once the board is drawn at rest: it measures where the control
 * is drawn and pans by what it lacks (`panToReveal`). It pans rather than asking the browser to scroll: a scroll of
 * the window stops where its content ends, which was short of the control on a page still loading (CI, 20 Nov 2026:
 * 80 pixels of a 550-pixel way, twice), and not at all toward a control past the window's left or top edge.
 *
 * It never measures a board that still moves: the pan is added to the view the glide is going to, so it would be
 * off by what the glide had left, and it would cut the glide short. While a glide runs it waits for that glide's own
 * end (`finished`; a glide that is cut short ends there too), with no clock and no count of frames, then looks
 * again, since another glide can have started. One wait runs at a time (`pending`), and it ends when the focus
 * leaves the board.
 */
function revealFocusedAtRest(pane: HTMLElement, pending: PendingReveal, pan: (delta: { x: number; y: number }) => void) {
  if (pending.frame !== null) cancelAnimationFrame(pending.frame);
  pending.turn += 1;
  const turn = pending.turn;
  pending.frame = requestAnimationFrame(() => {
    pending.frame = null;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === pane || !pane.contains(focused)) return;
    const glides = glidesOf(pane);
    if (glides.length > 0) {
      const atRest = Promise.allSettled(glides.map((glide) => glide.finished));
      atRest.then(() => { if (pending.turn === turn) revealFocusedAtRest(pane, pending, pan); }).catch(() => undefined);
      return;
    }
    const delta = panToReveal(focused.getBoundingClientRect(), pane.getBoundingClientRect());
    if (delta.x !== 0 || delta.y !== 0) pan(delta);
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
  const reveal = useRef<PendingReveal>({ frame: null, turn: 0 });
  const focusMoved = useRef(false);
  useEffect(() => {
    const pending = reveal.current;
    return () => {
      if (pending.frame !== null) cancelAnimationFrame(pending.frame);
      // A reveal that waits for a glide to end finds its turn gone.
      pending.turn += 1;
    };
  }, []);
  const room = size ?? { width: 0, height: 0 };
  const view = moved ?? fitView(bounds, room);
  const latest = useRef({ view, bounds, room });
  useEffect(() => {
    latest.current = { view, bounds, room };
  });

  const move = useCallback((next: BoardView, smooth: boolean) => {
    const moved = { zoom: next.zoom, x: Math.round(next.x), y: Math.round(next.y) };
    // Noted at once, not only by the effect above: the handlers start from `latest`, and two of them can run before
    // that effect does (a scroll in one frame and another in the next), so the second must start from the first's view.
    latest.current = { ...latest.current, view: moved };
    setGlide(smooth);
    setMoved(moved);
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

  /** Moves the view by a pan on the page, from the newest view (`latest`), with no glide. Like every pan, it ends in `keepInWindow` (`panBy`), which only ever brings more of the board into the window, and a control is drawn on the board. */
  const panToFocused = (delta: { x: number; y: number }) => {
    move(panBy(latest.current.view, delta, latest.current.bounds, latest.current.room), false);
  };

  // Focus moving to a control outside the window (Tab) makes the browser scroll the window, even though it shows no scrollbars. Turn that scroll into a pan, so the control comes into view and the view stays the one source of the board's place.
  // That pan can be short of the control, in three ways. While a glide runs, the browser measures the scroll against
  // the board as it is drawn at that moment, not where the view comes to rest, so the pan is off by what the glide
  // had left. The window scrolls no further than its content reaches, at rest too. And it never scrolls back past
  // its own start, so a control past its left or top edge gets no scroll at all, and no scroll event. So after every
  // focus on a control, once the board is drawn at rest, the board pans by what the focused control still lacks,
  // measured then; nothing when it lacks nothing.
  // That a focus moved is noted when it moves, not read from the board when the scroll arrives: the scroll event comes
  // a frame later, and on a busy page a glide can be over by then, with the scroll still measured in the middle of it.
  // The note lasts one frame: the scroll event of this focus runs before that frame's callbacks and takes the note,
  // so a later scroll from another cause never reads it. A note still there in that frame's callback is a focus
  // that scrolled nothing, and the reveal starts from there, for a focus the browser would show a ring for
  // (`:focus-visible`: the keyboard). A pointer press on a control that is partly in view focuses it too, and the
  // board must not move under the pointer.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const pane = event.currentTarget;
    focusMoved.current = enabled && event.target !== pane;
    if (!focusMoved.current) return;
    requestAnimationFrame(() => {
      if (!focusMoved.current) return;
      focusMoved.current = false;
      if (document.activeElement?.matches(":focus-visible")) revealFocusedAtRest(pane, reveal.current, panToFocused);
    });
  };

  const onScroll = (event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const { scrollLeft, scrollTop } = element;
    if (scrollLeft === 0 && scrollTop === 0) return;
    const reveals = focusMoved.current || isGliding(element);
    focusMoved.current = false;
    element.scrollLeft = 0;
    element.scrollTop = 0;
    const current = latest.current.view;
    // Drawn before this returns: the reveal below measures the board in this same frame, and must find the pan in it.
    flushSync(() => { move({ zoom: current.zoom, x: current.x - scrollLeft, y: current.y - scrollTop }, false); });
    if (reveals) revealFocusedAtRest(element, reveal.current, panToFocused);
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
    // Noted at once, as in `move`: a handler that runs before the effect must start from the fitted view.
    latest.current = { ...latest.current, view: fitView(latest.current.bounds, latest.current.room) };
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
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPress, onPointerCancel: cancelPress, onLostPointerCapture: endPress, onKeyDown, onFocus, onScroll, onDragStart },
  };
}
