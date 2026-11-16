"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";

import { boundsOf, zoomPercent, type BoardView, type Box } from "@/lib/canvas/view-rules";
import { cn } from "@/lib/utils";

import { BoardFullScreen } from "./board-full-screen";
import { BoardToolbar, fullScreenLabel } from "./board-toolbar";
import { CanvasFrame, unmeasuredHeight, type BoardFrame } from "./canvas-frame";
import { useBoardWindow, useFrameHeights, type BoardMode } from "./use-board-measure";
import { usePanZoom, type PanZoom } from "./use-pan-zoom";

/** Space above the first row of frames for their names, which sit above each frame. */
const labelRoom = 28;

function frameBox(frame: BoardFrame, heights: Readonly<Record<string, number>>): Box {
  return { x: frame.x, y: frame.y, width: frame.width, height: heights[frame.id] ?? frame.height ?? unmeasuredHeight };
}

/** The board's place and scale, as custom properties the world's and the labels' styles read. */
function viewVariables(view: BoardView): CSSProperties {
  return {
    ["--canvas-x" as string]: `${String(Math.round(view.x))}px`,
    ["--canvas-y" as string]: `${String(Math.round(view.y))}px`,
    ["--canvas-zoom" as string]: String(view.zoom),
  };
}

/**
 * The window's styles follow the canvas column, by a container query at
 * `stackBelowWidth` (640 pixels). Narrower, the window is plain: the frames
 * are in the page's flow. From that width on it is a fixed-height window onto
 * the board, and `--canvas-mode` tells the script so.
 *
 * Touch in the window: `touch-pan-y` leaves a one-finger vertical swipe to
 * the page, so a reader can always scroll past the board. A sideways drag
 * pans the board, and two fingers zoom it (see `usePinch`).
 */
const windowBase =
  "relative min-w-0 overflow-x-clip outline-none [--canvas-mode:stacked] focus-visible:ring-3 focus-visible:ring-ring/50 @[640px]/canvas:touch-pan-y @[640px]/canvas:overflow-hidden @[640px]/canvas:bg-muted/40 @[640px]/canvas:[--canvas-mode:board]";

/** The board in the page: a window of a fixed height, with an edge. */
const windowInPage = "@[640px]/canvas:h-[clamp(24rem,72dvh,52rem)] @[640px]/canvas:rounded-xl @[640px]/canvas:border @[640px]/canvas:border-card-edge";

/** The full-screen board: the whole window, so its focus ring is drawn inside it. */
const windowOnScreen = "focus-visible:ring-inset @[640px]/canvas:h-dvh";

function windowClass(mode: BoardMode, dragging: boolean, fullScreen: boolean): string {
  return cn(
    windowBase,
    fullScreen ? windowOnScreen : windowInPage,
    // Until the script has fitted the board, its window keeps its room but shows nothing. Stacked frames need no script and show at once.
    mode === "measuring" && "@[640px]/canvas:invisible",
    mode === "board" && (dragging ? "cursor-grabbing select-none" : "cursor-grab"),
  );
}

/** The frames' parent: a column in the page, or the board, moved and scaled by the view. */
const worldBase =
  "flex flex-col gap-8 @[640px]/canvas:absolute @[640px]/canvas:top-0 @[640px]/canvas:left-0 @[640px]/canvas:block @[640px]/canvas:origin-top-left @[640px]/canvas:[transform:translate(var(--canvas-x),var(--canvas-y))_scale(var(--canvas-zoom))]";

function worldClass(board: PanZoom): string {
  return cn(worldBase, !board.dragging && "cursor-auto", board.glide && !board.dragging && "transition-transform duration-200 ease-out motion-reduce:transition-none");
}

/** What the window element needs only while it is a board: focus, the spoken hint, and the pan handlers. */
function boardProps(mode: BoardMode, board: PanZoom, hintId: string) {
  if (mode !== "board") return {};
  return { tabIndex: 0, "aria-describedby": hintId, "data-canvas-zoom": zoomPercent(board.view.zoom), ...board.handlers };
}

/** Marks the board in the page, so focus can return to its Full screen button. */
const pageBoardAttribute = "data-canvas-page-board";

interface BoardProps {
  frames: readonly BoardFrame[];
  /** True for the board that fills the window; false for the board in the page. */
  fullScreen: boolean;
  onFullScreenChange: (fullScreen: boolean) => void;
}

/**
 * The full-screen board takes focus as soon as it is a board, so the arrow
 * keys move it at once. Full screen is for the board only: when its window
 * becomes too narrow for one, it closes, and the page shows the stacked
 * frames.
 */
function useFullScreenBoard(windowRef: RefObject<HTMLElement | null>, mode: BoardMode, fullScreen: boolean, onFullScreenChange: (fullScreen: boolean) => void): void {
  useEffect(() => {
    if (!fullScreen) return;
    if (mode === "board") windowRef.current?.focus({ preventScroll: true });
    if (mode === "stacked") onFullScreenChange(false);
  }, [windowRef, mode, fullScreen, onFullScreenChange]);
}

/** One board: the window, its controls, and the frames. The page draws one, and full screen draws a second one over the whole window. */
function Board({ frames, fullScreen, onFullScreenChange }: BoardProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const { mode, size } = useBoardWindow(windowRef);
  const onBoard = mode === "board";
  const heights = useFrameHeights(windowRef, frames.map((frame) => frame.id).join(" "), onBoard);
  const bounds = useMemo(() => {
    const box = boundsOf(frames.map((frame) => frameBox(frame, heights)));
    return box ? { ...box, y: box.y - labelRoom, height: box.height + labelRoom } : null;
  }, [frames, heights]);
  const board = usePanZoom(windowRef, bounds, size, onBoard);
  useFullScreenBoard(windowRef, mode, fullScreen, onFullScreenChange);

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
    <div className="@container/canvas min-w-0" {...(fullScreen ? {} : { [pageBoardAttribute]: "" })}>
      <div
        ref={windowRef}
        role="group"
        aria-label={`Canvas, ${String(frames.length)} ${frames.length === 1 ? "frame" : "frames"}`}
        data-canvas-board={mode}
        className={windowClass(mode, board.dragging, fullScreen)}
        {...boardProps(mode, board, hintId)}
      >
        {onBoard ? (
          <>
            <p id={hintId} className="sr-only">
              Drag to move the board. Hold Control or Command and scroll, or pinch with two fingers, to zoom. With the board focused, arrow keys move it, plus and minus zoom, and 0 fits every frame. The Frames menu goes to any frame.
            </p>
            <BoardToolbar
              frames={frames}
              zoom={board.view.zoom}
              onZoomIn={board.zoomIn}
              onZoomOut={board.zoomOut}
              onActualSize={board.actualSize}
              onFit={board.fit}
              onShowFrame={showFrame}
              focusPickedFrame={focusPickedFrame}
              fullScreen={fullScreen}
              onFullScreenChange={onFullScreenChange}
            />
          </>
        ) : null}
        <div data-canvas-world="" className={worldClass(board)} style={viewVariables(board.view)}>
          {frames.map((frame) => (
            <CanvasFrame key={frame.id} frame={frame} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The canvas viewer. In a column at least 640 pixels wide it is a board: a
 * fixed-height window onto frames at their places, panned by drag and zoomed
 * with the toolbar, Ctrl/⌘ + wheel, or two fingers. A plain wheel and a
 * vertical swipe are never taken, so the page always scrolls. In a narrower
 * column (a phone) the frames stack in the page, each scaled to the column,
 * with no board to pan.
 *
 * The styles choose between the two from the column's width, and place and
 * scale every frame, so the server's markup already has its final layout: a
 * stacked canvas shows before any script runs, and nothing on the page moves
 * when scripts start. Both draw the same elements, so a frame keeps its
 * on-page state when the column crosses that width. The script adds what
 * only it can: the board's fit, pan, zoom, and controls.
 *
 * The board's Full screen button opens a second board over the whole window
 * (BoardFullScreen), and the board in the page stays where it is. The second
 * board fits its frames again and draws them from their specs, so it starts
 * from each frame's first state, not from what a reader changed in the page.
 */
export function CanvasBoard({ frames }: { frames: readonly BoardFrame[] }) {
  const [fullScreen, setFullScreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Back in the page, focus goes to the button that opened full screen, or to the canvas itself when its controls are gone (a narrow window stacks the frames).
  const focusPageBoard = () => {
    const root = rootRef.current;
    const button = root?.querySelector<HTMLElement>(`[${pageBoardAttribute}] button[aria-label="${fullScreenLabel}"]`);
    (button ?? root)?.focus({ preventScroll: true });
  };
  return (
    <div ref={rootRef} tabIndex={-1} className="min-w-0 outline-none">
      <Board frames={frames} fullScreen={false} onFullScreenChange={setFullScreen} />
      <BoardFullScreen open={fullScreen} onOpenChange={setFullScreen} onClosed={focusPageBoard}>
        <Board frames={frames} fullScreen onFullScreenChange={setFullScreen} />
      </BoardFullScreen>
    </div>
  );
}
