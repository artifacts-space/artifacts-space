"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { applyPanelSize, savePanelSize } from "@/components/app/panel-size-storage";
import { clampSize, isResetKey, keyboardResize, type PanelSpec, type SizeBounds, type SplitterOrientation } from "@/lib/panel-size-rules";
import { cn } from "@/lib/utils";

/** A panel's drawn size and how far it may go, measured from the page. */
export interface PanelMeasure {
  size: number;
  bounds: SizeBounds;
}

interface PanelSplitterProps {
  panel: PanelSpec;
  /** The handle's accessible name, such as "Resize the sidebar". */
  label: string;
  /** The id of the panel the handle sizes. */
  controls: string;
  /** "vertical" for a line that moves left and right, "horizontal" for one that moves up and down. */
  orientation: SplitterOrientation;
  /** Reads the panel's size and bounds from the page; null while it is not drawn. Called from events and observers only. */
  measure: () => PanelMeasure | null;
  /** The elements whose size changes move the panel's size or bounds. Called from an effect only. */
  watch: () => readonly (Element | null | undefined)[];
  /** What the handle reports before the first measure: the panel's default and its usual bounds. */
  initial: PanelMeasure;
  /** Where the handle sits on its panel's edge. */
  className: string;
}

interface Drag {
  /** The pointer that started the drag; a second finger on the handle is ignored. */
  pointerId: number;
  origin: number;
  start: number;
  bounds: SizeBounds;
  /** The size the drag reached; null until the pointer moves. */
  size: number | null;
}

const cursors: Record<SplitterOrientation, string> = { vertical: "col-resize", horizontal: "row-resize" };

/** The keys that move each kind of handle, for its screen reader hint. */
const arrowKeys: Record<SplitterOrientation, string> = { vertical: "the Left and Right arrows", horizontal: "the Up and Down arrows" };

/** Where the pointer is along the axis the handle moves on. */
function along(event: React.PointerEvent, orientation: SplitterOrientation) {
  return orientation === "vertical" ? event.clientX : event.clientY;
}

/** Keeps the handle's reported size and bounds current while the layout around it changes. */
function useMeasured(initial: PanelMeasure, measure: () => PanelMeasure | null, watch: PanelSplitterProps["watch"]) {
  const [value, setValue] = useState(initial);
  const [measured, setMeasured] = useState(false);
  const refresh = useEffectEvent(() => {
    const next = measure();
    if (!next) return;
    setValue(next);
    setMeasured(true);
  });
  const watched = useEffectEvent(watch);
  useEffect(() => {
    const observer = new ResizeObserver(() => { refresh(); });
    for (const element of watched()) if (element) observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);
  return { value, setValue, measured };
}

/**
 * A handle on the edge between two panels: drag it, or focus it and use the
 * arrow keys (Shift for bigger steps, Home and End for the minimum and
 * maximum), to resize the panel; double-click it or press Enter to go back
 * to the default.
 * Sizes are remembered per viewer. It follows the WAI-ARIA window splitter
 * pattern. Shown from lg up only: below that the sidebar stacks over the
 * artifact, and the layout keeps its fixed sizes.
 */
export function PanelSplitter({ panel, label, controls, orientation, measure, watch, initial, className }: PanelSplitterProps) {
  const { value, setValue, measured } = useMeasured(initial, measure, watch);
  const [dragging, setDragging] = useState(false);
  /**
   * Whether the keyboard is driving the handle, which alone draws the brand line: set by keyboard focus and by
   * the resize keys, cleared by a pointer press and on blur. :focus-visible is decided once, at focus, so it
   * misses arrow keys after a drag and stays on through a drag after Tab.
   */
  const [keyboard, setKeyboard] = useState(false);
  const drag = useRef<Drag | null>(null);
  const hintId = useId();
  /** A size set from the keyboard and not yet stored: held keys repeat, so it is stored on key up or blur. */
  const unsaved = useRef<number | null>(null);

  // A handle that leaves mid-drag or mid-keypress (the Projects group closing, the window narrowing past lg)
  // must not leave its cursor on the page, and must still store a size the keyboard set.
  useEffect(() => () => {
    if (drag.current) document.documentElement.style.removeProperty("cursor");
    if (unsaved.current !== null) savePanelSize(panel, unsaved.current);
  }, [panel]);

  function show(size: number, bounds: SizeBounds) {
    applyPanelSize(panel, size);
    setValue({ size, bounds });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    const now = measure();
    if (!now) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // A pointer focuses the handle for the keyboard after it, without the keyboard focus style. Browsers
    // without this option (before Chrome 144, Safari 18.4) ignore it, so the flag is cleared after focusing.
    event.currentTarget.focus({ preventScroll: true, focusVisible: false });
    setKeyboard(false);
    drag.current = { pointerId: event.pointerId, origin: along(event, orientation), start: now.size, bounds: now.bounds, size: null };
    document.documentElement.style.cursor = cursors[orientation];
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    current.size = clampSize(current.start + along(event, orientation) - current.origin, current.bounds);
    show(current.size, current.bounds);
  }

  function endDrag(event: React.PointerEvent) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    document.documentElement.style.removeProperty("cursor");
    setDragging(false);
    // A click without a move keeps the default instead of storing it.
    if (current.size !== null) savePanelSize(panel, current.size);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (isResetKey(event.key)) {
      event.preventDefault();
      setKeyboard(true);
      reset();
      return;
    }
    const now = measure();
    if (!now) return;
    const next = keyboardResize(event.key, event.shiftKey, now.size, now.bounds, orientation);
    if (next === null) return;
    event.preventDefault();
    setKeyboard(true);
    if (next === now.size) return;
    show(next, now.bounds);
    unsaved.current = next;
  }

  function onFocus(event: React.FocusEvent<HTMLDivElement>) {
    setKeyboard(event.currentTarget.matches(":focus-visible"));
  }

  function onBlur() {
    setKeyboard(false);
    saveKeyboardSize();
  }

  function saveKeyboardSize() {
    if (unsaved.current === null) return;
    savePanelSize(panel, unsaved.current);
    unsaved.current = null;
  }

  function reset() {
    unsaved.current = null;
    applyPanelSize(panel, null);
    savePanelSize(panel, null);
    const now = measure();
    if (now) setValue(now);
  }

  return (
    <>
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value.size)}
      aria-valuemin={value.bounds.min}
      aria-valuemax={value.bounds.max}
      aria-valuetext={`${String(Math.round(value.size))} pixels`}
      aria-describedby={hintId}
      title="Drag to resize. Double-click to reset."
      data-slot="panel-splitter"
      data-measured={measured ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      data-keyboard={keyboard ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
      onKeyUp={saveKeyboardSize}
      onFocus={onFocus}
      onBlur={onBlur}
      onDoubleClick={reset}
      className={cn(
        "absolute z-20 hidden touch-none select-none outline-none lg:block",
        // The line is the only mark: invisible at rest (the border shows), a quiet bar on hover and while dragging,
        // and a thicker brand bar from the keyboard. A ring around the handle would box its whole grab area.
        // Forced colors drop the bar's background, so there keyboard focus gets an outline instead.
        "after:absolute after:bg-transparent after:transition-colors hover:after:bg-foreground/20 data-[dragging]:after:bg-foreground/30 data-[keyboard]:after:bg-brand",
        "forced-colors:data-[keyboard]:outline-2 forced-colors:data-[keyboard]:outline-solid",
        orientation === "vertical"
          // A vertical handle sits just past its panel's edge, so its line runs along the handle's start, on the border.
          ? "cursor-col-resize after:inset-y-0 after:left-0 after:w-0.5 data-[keyboard]:after:w-1"
          : "cursor-row-resize after:inset-x-0 after:top-1/2 after:h-0.5 after:-translate-y-1/2 data-[keyboard]:after:h-1",
        className,
      )}
    />
    <span id={hintId} hidden>Use {arrowKeys[orientation]} to resize, Home and End for the smallest and largest size, and Enter or a double-click to reset.</span>
    </>
  );
}
