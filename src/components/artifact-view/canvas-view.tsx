"use client";

import { useMemo } from "react";

import { placeFrames } from "@/lib/canvas/layout";
import { frameSpecText, readCanvas, type CanvasFrameRead } from "@/lib/canvas/read";

import { CanvasBoard } from "./canvas/canvas-board";
import type { BoardFrame } from "./canvas/canvas-frame";
import { IssueList, ViewNotice } from "./view-notice";

function toBoardFrames(frames: readonly CanvasFrameRead[]): BoardFrame[] {
  const places = placeFrames(frames);
  return frames.map((frame, index) => ({
    id: frame.id,
    name: frame.name,
    width: frame.width,
    height: frame.height,
    padding: frame.padding,
    x: places[index]?.x ?? 0,
    y: places[index]?.y ?? 0,
    spec: frameSpecText(frame),
    errors: frame.issues.filter((issue) => issue.severity === "error"),
  }));
}

/**
 * Renders a canvas artifact: a board of frames, each a ui spec drawn by the
 * same renderer as a ui artifact. A canvas that cannot be read shows its
 * issues instead. A frame with a problem shows a notice in its place while
 * the other frames still render, and each frame keeps its own on-page state.
 */
export function CanvasView({ content }: { content: string }) {
  const read = useMemo(() => readCanvas(content), [content]);
  const frames = useMemo(() => toBoardFrames(read.frames), [read]);
  if (!read.renderable) {
    return (
      <ViewNotice tone="warning" title="This canvas could not be shown.">
        <IssueList issues={read.issues} />
      </ViewNotice>
    );
  }
  if (frames.length === 0) return <ViewNotice title="This canvas has no frames yet." />;
  return <CanvasBoard frames={frames} />;
}
