"use client";

import { useId, useMemo, useRef, type CSSProperties } from "react";

import { boundsOf, stackBelowWidth, stackedScale, zoomPercent, type BoardView, type Box, type Size } from "@/lib/canvas/view-rules";
import { cn } from "@/lib/utils";

import { BoardToolbar } from "./board-toolbar";
import { CanvasFrame, unmeasuredHeight, type BoardFrame } from "./canvas-frame";
import { useBoardSize, useFrameHeights } from "./use-board-measure";
import { usePanZoom, type PanZoom } from "./use-pan-zoom";

/** Space above the first row of frames for their names, which sit above each frame. */
const labelRoom = 28;

/** How the viewer lays frames out: not measured yet, a pannable board, or stacked in the page column. */
type Mode = "measuring" | "board" | "stacked";

function modeFor(size: Size | null): Mode {
  if (size === null) return "measuring";
  return size.width < stackBelowWidth ? "stacked" : "board";
}

function frameBox(frame: BoardFrame, heights: Readonly<Record<string, number>>): Box {
  return { x: frame.x, y: frame.y, width: frame.width, height: heights[frame.id] ?? frame.height ?? unmeasuredHeight };
}

function worldStyle(view: BoardView): CSSProperties {
  return {
    transform: `translate(${String(Math.round(view.x))}px, ${String(Math.round(view.y))}px) scale(${String(view.zoom)})`,
    transformOrigin: "0 0",
    ["--canvas-zoom" as string]: String(view.zoom),
  };
}

function windowClass(mode: Mode, dragging: boolean): string {
  if (mode === "stacked") return "relative min-w-0 outline-none";
  return cn(
    "relative h-[clamp(24rem,72dvh,52rem)] min-w-0 touch-pan-y overflow-hidden rounded-xl border border-card-edge bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    dragging ? "cursor-grabbing select-none" : "cursor-grab",
    mode === "measuring" && "invisible",
  );
}

function worldClass(mode: Mode, board: PanZoom): string {
  if (mode === "stacked") return "flex flex-col gap-8";
  return cn("absolute top-0 left-0", !board.dragging && "cursor-auto", board.glide && !board.dragging && "transition-transform duration-200 ease-out motion-reduce:transition-none");
}

/** What the window element needs only while it is a board: focus, the spoken hint, and the pan handlers. */
function boardProps(mode: Mode, board: PanZoom, hintId: string) {
  if (mode === "stacked") return {};
  return { tabIndex: 0, "aria-describedby": hintId, ...board.handlers };
}

/**
 * The canvas viewer. In a column at least `stackBelowWidth` wide it is a
 * board: a fixed-height window onto frames at their places, panned by drag
 * and zoomed with the toolbar or Ctrl/⌘ + wheel. A plain wheel and a vertical
 * swipe are never taken, so the page always scrolls. In a narrower column
 * (a phone) the frames stack in the page, each scaled to the column, with no
 * board to pan. Both draw the same elements, so a frame keeps its on-page
 * state when the column crosses that width. Until the browser has measured
 * the column, the frames are in the page but not shown.
 */
export function CanvasBoard({ frames }: { frames: readonly BoardFrame[] }) {
  const windowRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const size = useBoardSize(windowRef);
  const heights = useFrameHeights(windowRef, frames.map((frame) => frame.id).join(" "));
  const mode = modeFor(size);
  const bounds = useMemo(() => {
    const box = boundsOf(frames.map((frame) => frameBox(frame, heights)));
    return box ? { ...box, y: box.y - labelRoom, height: box.height + labelRoom } : null;
  }, [frames, heights]);
  const board = usePanZoom(windowRef, bounds, size, mode !== "stacked");
  const columnWidth = size?.width ?? 0;

  const picked = useRef<string | null>(null);
  const showFrame = (frame: BoardFrame) => {
    board.showFrame({ ...frameBox(frame, heights), y: frame.y - labelRoom });
    picked.current = frame.id;
  };
  // The menu calls this as it closes: focus goes to the picked frame, not back to the menu's button.
  const focusPickedFrame = () => {
    const id = picked.current;
    picked.current = null;
    const element = id === null ? null : windowRef.current?.querySelector<HTMLElement>(`[data-canvas-frame="${id}"]`);
    element?.focus({ preventScroll: true });
    return Boolean(element);
  };

  return (
    <div
      ref={windowRef}
      role="group"
      aria-label={`Canvas, ${String(frames.length)} ${frames.length === 1 ? "frame" : "frames"}`}
      data-canvas-board={mode}
      data-canvas-zoom={zoomPercent(board.view.zoom)}
      className={windowClass(mode, board.dragging)}
      {...boardProps(mode, board, hintId)}
    >
      {mode === "stacked" ? null : (
        <>
          <p id={hintId} className="sr-only">
            Drag to move the board. Hold Control or Command and scroll to zoom. With the board focused, arrow keys move it, plus and minus zoom, and 0 fits every frame. The Frames menu goes to any frame.
          </p>
          <BoardToolbar frames={frames} zoom={board.view.zoom} onZoomIn={board.zoomIn} onZoomOut={board.zoomOut} onActualSize={board.actualSize} onFit={board.fit} onShowFrame={showFrame} focusPickedFrame={focusPickedFrame} />
        </>
      )}
      <div data-canvas-world="" className={worldClass(mode, board)} style={mode === "stacked" ? undefined : worldStyle(board.view)}>
        {frames.map((frame) => (
          <CanvasFrame
            key={frame.id}
            frame={frame}
            onBoard={mode !== "stacked"}
            scale={mode === "stacked" ? stackedScale(frame.width, columnWidth) : 1}
            measuredHeight={heights[frame.id] ?? frame.height ?? unmeasuredHeight}
          />
        ))}
      </div>
    </div>
  );
}
