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

/**
 * The frame's numbers, as custom properties its styles read. The styles place
 * and scale the frame, so the same markup is right on a board and stacked.
 */
function frameVariables(frame: BoardFrame): CSSProperties {
  return {
    ["--frame-x" as string]: `${String(frame.x)}px`,
    ["--frame-y" as string]: `${String(frame.y)}px`,
    ["--frame-width" as string]: `${String(frame.width)}px`,
    // On the board, a frame outside the window skips its layout and paint until it comes near; this height stands in until then.
    ["--frame-rest-height" as string]: `${String(frame.height ?? unmeasuredHeight)}px`,
  };
}

/** The frame's place. In the column it is in the page's flow; on the board it sits at its own x and y. */
const slotClass = "group/frame rounded-lg outline-none @[640px]/canvas:absolute @[640px]/canvas:top-(--frame-y) @[640px]/canvas:left-(--frame-x) @[640px]/canvas:w-(--frame-width)";

/** The name and size above a frame. On the board it hangs above the frame and keeps its size at every zoom. */
const labelClass =
  "flex min-w-0 items-baseline gap-2 pb-1.5 text-xs select-none @[640px]/canvas:absolute @[640px]/canvas:bottom-full @[640px]/canvas:left-0 @[640px]/canvas:w-[calc(var(--frame-width)*var(--canvas-zoom,1))] @[640px]/canvas:origin-bottom-left @[640px]/canvas:[transform:scale(calc(1/var(--canvas-zoom,1)))]";

/**
 * The frame's content, always laid out at the frame's real width. In the
 * column it is scaled to fit by `zoom`, from the column's width alone
 * (`tan(atan2(a, b))` is a divided by b for two lengths), so the page gives
 * the frame its final room with no script and nothing moves when scripts
 * start. On the board the board's own transform scales every frame, and a
 * frame outside the window skips its layout and paint until it comes near.
 */
const bodyClass =
  "flex w-(--frame-width) flex-col rounded-lg border border-card-edge bg-background text-foreground shadow-xs [zoom:min(1,tan(atan2(100cqw,var(--frame-width))))] group-focus-visible/frame:ring-3 group-focus-visible/frame:ring-ring/50 @[640px]/canvas:[zoom:1] @[640px]/canvas:[contain-intrinsic-block-size:auto_var(--frame-rest-height)] @[640px]/canvas:[content-visibility:auto]";

/**
 * One frame: its name and size above it, then its content at the frame's real
 * width. Its styles follow the canvas column: in a narrow column the frame is
 * in the page's flow, scaled to the column; in a wide one it sits at its
 * place on the board, which scales it. The scaling is outside the renderer's
 * root, so components inside still measure the frame's real width.
 */
export const CanvasFrame = memo(function CanvasFrame({ frame }: { frame: BoardFrame }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} tabIndex={-1} data-canvas-frame={frame.id} className={slotClass} style={frameVariables(frame)}>
      <div id={labelId} data-comment-skip="" data-canvas-frame-label="" className={labelClass}>
        <span className="truncate font-medium text-foreground">{frame.name}</span>
        <span className="shrink-0 text-muted-foreground">{frameSizeLabel(frame)}</span>
      </div>
      <div {...{ [frameBodyAttribute]: frame.id }} className={cn(bodyClass, paddingClass[frame.padding])} style={{ minHeight: frame.height ?? undefined }}>
        <FrameContent frame={frame} />
      </div>
    </div>
  );
});
