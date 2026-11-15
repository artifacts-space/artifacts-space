"use client";

import { memo, useId, type CSSProperties } from "react";

import type { CanvasIssue } from "@/lib/canvas/issues";
import type { FramePadding } from "@/lib/canvas/limits";
import { cn } from "@/lib/utils";

import { UiView } from "../ui-view";
import { IssueList, ViewNotice } from "../view-notice";
import { frameBodyAttribute } from "./use-board-measure";

/** One frame, ready to draw: its fields, its place on the board, and its spec as JSON text. */
export interface BoardFrame {
  id: string;
  name: string;
  width: number;
  /** The least height the frame asks for, or null when it follows its content. */
  height: number | null;
  padding: FramePadding;
  x: number;
  y: number;
  /** The ui spec as JSON text, or null when the frame has no usable spec. */
  spec: string | null;
  /** Errors in the frame's own fields. Any of them replaces the spec with a notice. */
  errors: readonly CanvasIssue[];
}

/** The height the board assumes for a frame it has not measured yet. */
export const unmeasuredHeight = 800;

const paddingClass: Record<FramePadding, string> = { none: "p-0", sm: "p-4", md: "p-6", lg: "p-10" };

/** The size shown beside a frame's name: its width, and its least height when it has one. */
export function frameSizeLabel(frame: Pick<BoardFrame, "width" | "height">): string {
  return frame.height === null ? String(frame.width) : `${String(frame.width)} × ${String(frame.height)}`;
}

/** The frame's spec, drawn by the same renderer as a ui artifact. Memoized so moving the board never redraws it. */
const FrameSpec = memo(function FrameSpec({ content }: { content: string }) {
  return <UiView content={content} />;
});

function FrameContent({ frame }: { frame: BoardFrame }) {
  if (frame.errors.length > 0 || frame.spec === null) {
    return (
      <ViewNotice tone="warning" title="This frame could not be shown.">
        <IssueList issues={frame.errors} />
      </ViewNotice>
    );
  }
  return <FrameSpec content={frame.spec} />;
}

interface CanvasFrameProps {
  frame: BoardFrame;
  /** True on the pannable board; false when frames stack in the page column. */
  onBoard: boolean;
  /** Stacked only: the scale that fits the frame into the column. */
  scale: number;
  /** Stacked only: the frame's measured height at 100%, so the page keeps room for the scaled frame. */
  measuredHeight: number;
}

function slotStyle({ frame, onBoard }: CanvasFrameProps): CSSProperties {
  return onBoard ? { position: "absolute", left: frame.x, top: frame.y, width: frame.width } : {};
}

function bodyStyle({ frame, onBoard, scale }: CanvasFrameProps): CSSProperties {
  const size: CSSProperties = { width: frame.width, minHeight: frame.height ?? undefined };
  // On the board, a frame outside the window skips its layout and paint until it comes near; the size is a stand-in until then.
  if (onBoard) return { ...size, contentVisibility: "auto", containIntrinsicBlockSize: `auto ${String(frame.height ?? unmeasuredHeight)}px` };
  return { ...size, transform: `scale(${String(scale)})`, transformOrigin: "top left" };
}

/**
 * One frame: its name and size above it, then its content at the frame's real
 * width. On the board the frame sits at its place and the board's transform
 * scales it. Stacked, it is scaled to the column and the page keeps exactly
 * the room the scaled frame takes. The element that carries the transform is
 * outside the renderer's root, so components inside still measure the
 * frame's real width.
 */
export const CanvasFrame = memo(function CanvasFrame(props: CanvasFrameProps) {
  const { frame, onBoard, scale, measuredHeight } = props;
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      tabIndex={-1}
      data-canvas-frame={frame.id}
      className="group/frame rounded-lg outline-none"
      style={slotStyle(props)}
    >
      <div
        id={labelId}
        data-comment-skip=""
        data-canvas-frame-label=""
        className={cn("flex min-w-0 items-baseline gap-2 pb-1.5 text-xs select-none", onBoard && "absolute bottom-full left-0 origin-bottom-left")}
        style={onBoard ? { width: `calc(${String(frame.width)}px * var(--canvas-zoom, 1))`, transform: "scale(calc(1 / var(--canvas-zoom, 1)))" } : undefined}
      >
        <span className="truncate font-medium text-foreground">{frame.name}</span>
        <span className="shrink-0 text-muted-foreground">{frameSizeLabel(frame)}</span>
      </div>
      <div className={cn(!onBoard && "overflow-hidden")} style={onBoard ? undefined : { width: frame.width * scale, height: measuredHeight * scale }}>
        <div
          {...{ [frameBodyAttribute]: frame.id }}
          className={cn(
            "flex flex-col rounded-lg border border-card-edge bg-background text-foreground shadow-xs group-focus-visible/frame:ring-3 group-focus-visible/frame:ring-ring/50",
            paddingClass[frame.padding],
          )}
          style={bodyStyle(props)}
        >
          <FrameContent frame={frame} />
        </div>
      </div>
    </div>
  );
});
