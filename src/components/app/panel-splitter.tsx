"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { applyPanelSize, savePanelSize } from "@/components/app/panel-size-storage";
import { clampSize, keyboardResize, type PanelSpec, type SizeBounds, type SplitterOrientation } from "@/lib/panel-size-rules";
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
 * maximum), to resize the panel; double-click it to go back to the default.
 * Sizes are remembered per viewer. It follows the WAI-ARIA window splitter
 * pattern. Shown from lg up only: below that the sidebar stacks over the
 * artifact, and the layout keeps its fixed sizes.
 */
export function PanelSplitter({ panel, label, controls, orientation, measure, watch, initial, className }: PanelSplitterProps) {
  const { value, setValue, measured } = useMeasured(initial, measure, watch);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  /** A size set from the keyboard and not yet stored: held keys repeat, so it is stored on key up or blur. */
  const unsaved = useRef<number | null>(null);

  // A handle that leaves mid-drag (the Projects group closing, say) must not leave its cursor on the page.
  useEffect(() => () => {
    if (drag.current) document.documentElement.style.removeProperty("cursor");
  }, []);

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
    event.currentTarget.focus({ preventScroll: true });
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
    const now = measure();
    if (!now) return;
    const next = keyboardResize(event.key, event.shiftKey, now.size, now.bounds, orientation);
    if (next === null) return;
    event.preventDefault();
    if (next === now.size) return;
    show(next, now.bounds);
    unsaved.current = next;
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
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value.size)}
      aria-valuemin={value.bounds.min}
      aria-valuemax={value.bounds.max}
      title="Drag to resize. Double-click to reset."
      data-slot="panel-splitter"
      data-measured={measured ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
      onKeyUp={saveKeyboardSize}
      onBlur={saveKeyboardSize}
      onDoubleClick={reset}
      className={cn(
        "absolute z-20 hidden touch-none rounded-sm select-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none lg:block",
        // The line: invisible at rest (the border shows), a quiet bar on hover and while dragging, the brand on focus.
        "after:absolute after:bg-transparent after:transition-colors hover:after:bg-foreground/20 data-[dragging]:after:bg-foreground/30 focus-visible:after:bg-brand",
        orientation === "vertical"
          // A vertical handle sits just past its panel's edge, so its line runs along the handle's start, on the border.
          ? "cursor-col-resize after:inset-y-0 after:left-0 after:w-0.5"
          : "cursor-row-resize after:inset-x-0 after:top-1/2 after:h-0.5 after:-translate-y-1/2",
        className,
      )}
    />
  );
}
