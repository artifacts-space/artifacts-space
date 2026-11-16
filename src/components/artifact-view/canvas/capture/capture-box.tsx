"use client";

import { memo, useCallback, useEffect, useRef, type CSSProperties } from "react";

import type { CaptureMode } from "@/lib/canvas/capture-rules";
import type { FramePadding } from "@/lib/canvas/limits";
import { fileUrl, type FileDto } from "@/lib/files/types";
import type { Theme } from "@/lib/themes/schema";
import { cn } from "@/lib/utils";

import { ArtifactFilesProvider, type FileUrlBuilder } from "../../files-context";
import { ThemeScope } from "../../theme-scope";
import { UiView } from "../../ui-view";
import { framePaddingClass, frameSurfaceClass } from "../canvas-frame";
import { blankPicture } from "./capture-pictures";

/** One drawing for the capture box: a frame's content in one mode, with the theme, files, and pictures it needs. */
export interface BoxJob {
  /** New for each drawing, so each gets fresh elements. */
  key: string;
  /** Raised each time the host waits for the box to be drawn again: first as it is, then clipped. */
  step: number;
  width: number;
  /** The least height the frame asks for, or null when it follows its content. */
  height: number | null;
  padding: FramePadding;
  /** The frame's ui spec as JSON text. */
  spec: string;
  mode: CaptureMode;
  theme: Theme;
  files: readonly FileDto[];
  /** The pictures the host fetched, by file id, as data URLs. */
  pictures: ReadonlyMap<string, string>;
  /** The height the drawing covers, once measured: the box is cut to it, so a very tall frame stays within what a browser can draw. */
  clipHeight: number | null;
}

/** The box's elements, for the host to measure and draw. */
export interface BoxElements {
  /** What is drawn: the frame's surface, cut to the drawing's height. */
  clip: HTMLElement;
  /** The frame's content at its full height. */
  body: HTMLElement;
}

/**
 * The room the board's frame gives its one-pixel edge, with no color: the
 * content then has exactly the width it has on the board, so lines wrap in
 * the image where they wrap for people.
 */
const edgeRoomClass = "border border-transparent";

/** The frame's spec from its own starting state, so an image never holds what a person typed into the board. Memoized: cutting the box does not draw it again. */
const BoxSpec = memo(function BoxSpec({ content }: { content: string }) {
  return <UiView content={content} />;
});

/**
 * One frame drawn for a capture: the frame's surface at its real width, in
 * the theme the server resolved with the mode forced, with the frame's own
 * padding and least height, the room of its edge without the edge's color,
 * and no shadow. It lives in the host's
 * hidden, inert container, so it is never seen, read aloud, or commented on.
 * Its pictures are the ones the host fetched and load at once. `onShown`
 * runs after each draw the host asked for, with the elements to measure.
 */
export function CaptureBox({ job, onShown }: { job: BoxJob; onShown: (step: number, elements: BoxElements | null) => void }) {
  const clip = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const { pictures, step } = job;
  const urlFor = useCallback<FileUrlBuilder>((fileId, download) => (download ? fileUrl(fileId, { download }) : pictures.get(fileId) ?? blankPicture), [pictures]);
  useEffect(() => {
    onShown(step, clip.current && body.current ? { clip: clip.current, body: body.current } : null);
  }, [step, onShown]);
  const clipStyle: CSSProperties = { width: job.width, ...(job.clipHeight === null ? {} : { height: job.clipHeight, overflow: "hidden" }) };
  const bodyStyle: CSSProperties = { ["--frame-width" as string]: `${String(job.width)}px`, minHeight: job.height ?? undefined };
  return (
    <ThemeScope theme={job.theme} mode={job.mode}>
      <div ref={clip} data-capture-box={job.mode} className="bg-background" style={clipStyle}>
        <div ref={body} className={cn(frameSurfaceClass, edgeRoomClass, framePaddingClass[job.padding])} style={bodyStyle}>
          <ArtifactFilesProvider files={job.files} urlFor={urlFor} eager>
            <BoxSpec content={job.spec} />
          </ArtifactFilesProvider>
        </div>
      </div>
    </ThemeScope>
  );
}
