"use client";

import { IconFileOff, IconPhotoOff } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { fileTypeLabel } from "@/lib/files/config";
import { hasAdjustableWidth, type MediaKind } from "@/lib/files/media-rules";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { FileCard } from "./file-card";
import { useMediaLoad, type MediaLoadHandlers } from "./use-media-load";

/**
 * One media block, drawn the same in the read view and the editor: an image,
 * a video or audio player, a PDF in the browser's viewer, or a download card,
 * with a caption under it. Every URL is the access-checked /api/files route,
 * so a reader who may not open the file sees the failed state, never the
 * file. Images and players show a quiet stand-in while they load and a
 * notice with a link to the file when they fail, with Try again: a refusal
 * such as a rate limit looks like any failure to the element, and failed
 * answers are never cached, so asking again can work.
 */

export interface MediaBlockProps {
  kind: MediaKind;
  url: string;
  downloadUrl: string;
  /** Alt text for an image; the name shown for other kinds. */
  alt: string;
  /** The caption, or the editor's caption field. */
  caption?: ReactNode;
  /** Percent of the text column on wider screens; phones always use the full column. */
  width: number | null;
  /** The file's details, when the page listed them. */
  file: FileDto | null;
  /** Extra parts drawn over the media, such as the editor's resize handle. */
  overlay?: ReactNode;
  className?: string;
}

function widthStyle(kind: MediaKind, width: number | null): CSSProperties | undefined {
  if (width === null || !hasAdjustableWidth(kind)) return undefined;
  return { "--media-width": `${String(width)}%` } as CSSProperties;
}

const interruptedCopy: Partial<Record<MediaKind, string>> = {
  video: "This video stopped loading.",
  audio: "This recording stopped loading.",
};

const failedCopy: Record<MediaKind, string> = {
  image: "This image could not be loaded.",
  video: "This video could not be loaded.",
  audio: "This recording could not be loaded.",
  pdf: "This PDF could not be loaded.",
  file: "This file could not be loaded.",
};

/** What shows when a file is missing, removed, or not readable by this reader. `onRetry` adds Try again. */
export function MediaNotice({ kind, children, href, onRetry }: { kind: MediaKind; children: ReactNode; href?: string | undefined; onRetry?: (() => void) | undefined }) {
  const Icon = kind === "image" ? IconPhotoOff : IconFileOff;
  return (
    <div role="note" data-comment-skip="" className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
      {onRetry ? <Button type="button" variant="link" size="sm" className="h-auto px-0 text-foreground" onClick={onRetry}>Try again</Button> : null}
      {href ? <a href={href} target="_blank" rel="noopener" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Open the file</a> : null}
    </div>
  );
}

interface ElementProps {
  kind: MediaKind;
  url: string;
  alt: string;
  sized: boolean;
  loading: boolean;
  handlers: MediaLoadHandlers;
}

function MediaElement({ kind, url, alt, sized, loading, handlers }: ElementProps) {
  const { attach, onLoad, onError } = handlers;
  const hidden = loading ? "absolute inset-0 opacity-0" : "";
  if (kind === "video") {
    return <video ref={attach} src={url} controls preload="metadata" playsInline aria-label={alt || "Video"} onLoadedMetadata={onLoad} onError={onError} className={cn("block max-h-[80vh] w-full rounded-lg bg-muted", hidden)} />;
  }
  if (kind === "audio") {
    return <audio ref={attach} src={url} controls preload="metadata" aria-label={alt || "Audio"} onLoadedMetadata={onLoad} onError={onError} className={cn("block w-full", hidden)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize
    <img ref={attach} src={url} alt={alt} loading="lazy" decoding="async" onLoad={onLoad} onError={onError} className={cn("block h-auto max-h-[80vh] max-w-full rounded-lg object-contain", sized && "w-full", hidden)} />
  );
}

function wrapperClass(kind: MediaKind, sized: boolean): string {
  return cn("relative max-w-full", kind === "image" && !sized ? "w-fit" : "w-full", sized && "sm:w-(--media-width)");
}

function PlayableMedia({ kind, url, alt, width, overlay }: Pick<MediaBlockProps, "kind" | "url" | "alt" | "width" | "overlay">) {
  const [state, handlers, attempt] = useMediaLoad(kind);
  if (state === "failed") return <MediaNotice kind={kind} href={url} onRetry={handlers.retry}>{failedCopy[kind]}</MediaNotice>;
  const sized = width !== null && hasAdjustableWidth(kind);
  const loading = state === "loading";
  const player = (
    <div className={wrapperClass(kind, sized)} style={widthStyle(kind, width)} data-media-state={state}>
      {loading ? <div aria-hidden className={cn("w-full animate-pulse rounded-lg bg-muted", kind === "audio" ? "h-12" : "aspect-video min-w-60")} /> : null}
      <MediaElement key={attempt} kind={kind} url={url} alt={alt} sized={sized} loading={loading} handlers={handlers} />
      {overlay}
    </div>
  );
  if (state !== "interrupted") return player;
  // The player stays where it stopped; Try again picks up from there.
  return (
    <>
      {player}
      <MediaNotice kind={kind} href={url} onRetry={handlers.resume}>{interruptedCopy[kind] ?? failedCopy[kind]}</MediaNotice>
    </>
  );
}

function fileFacts(file: FileDto | null, kind: MediaKind): string | null {
  if (file) return fileTypeLabel(file.contentType);
  return kind === "pdf" ? "PDF" : null;
}

function cardName(alt: string, file: FileDto | null, kind: MediaKind): string {
  if (alt) return alt;
  return file?.filename ?? (kind === "pdf" ? "PDF" : "Download file");
}

function MediaBody(props: MediaBlockProps) {
  const { kind, url, downloadUrl, alt, file } = props;
  if (kind !== "file" && kind !== "pdf") return <PlayableMedia kind={kind} url={url} alt={alt} width={props.width} overlay={props.overlay} />;
  const name = cardName(alt, file, kind);
  const card = <FileCard name={name} detail={fileFacts(file, kind)} size={file?.size ?? null} href={downloadUrl} />;
  if (kind === "file") return card;
  return (
    <div className="flex w-full flex-col gap-2">
      {/*
        No sandbox attribute: Chrome's PDF viewer refuses to run in any sandboxed frame (checked with
        "", allow-scripts, allow-same-origin, and both), so a sandbox would blank every PDF. The frame
        loads a short-lived R2 URL on another origin, which already keeps it away from this page.
      */}
      <iframe src={url} title={name} loading="lazy" referrerPolicy="no-referrer" className="h-[70vh] w-full rounded-lg border bg-muted shadow-xs" />
      {card}
    </div>
  );
}

/** See the notes at the top of this file. */
export function MediaBlock(props: MediaBlockProps) {
  return (
    <figure className={cn("artifact-media flex min-w-0 flex-col items-start gap-2", props.className)} data-media-kind={props.kind} data-comment-skip="">
      <MediaBody {...props} />
      {props.caption ? <figcaption className="w-full text-sm leading-5 text-muted-foreground">{props.caption}</figcaption> : null}
    </figure>
  );
}
