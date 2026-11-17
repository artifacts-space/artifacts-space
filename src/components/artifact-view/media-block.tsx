"use client";

import { IconArrowsMaximize, IconFileOff, IconPhotoOff } from "@tabler/icons-react";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { fileTypeLabel } from "@/lib/files/config";
import { keptDimensions, type ImageDimensions } from "@/lib/files/image-dimensions";
import { hasAdjustableWidth, type MediaKind } from "@/lib/files/media-rules";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { FileCard } from "./file-card";
import type { ImageViewerHandle } from "./image-viewer/use-image-viewer";
import { useMediaLoad, type MediaLoadHandlers, type MediaLoadState } from "./use-media-load";

/**
 * One media block, drawn the same in the read view and the editor: an image,
 * a video or audio player, a PDF in the browser's viewer, or a download card,
 * with a caption under it. Every URL is the access-checked /api/files route,
 * so a reader who may not open the file sees the failed state, never the
 * file. Images and players show a quiet stand-in while they load and a
 * notice with a link to the file when they fail, with Try again: a refusal
 * such as a rate limit looks like any failure to the element, and failed
 * answers are never cached, so asking again can work.
 *
 * An image whose pixel size the server stored (FileDto.width and height)
 * is drawn in a box of that shape from the first paint, so nothing under
 * it moves when the picture arrives. A stored size that turns out not to
 * be the picture's is dropped once it loads, and the picture shows at its
 * own size. With a viewer (useImageViewer), an image opens larger in place.
 */

/** What a block shows of its file: the name, type, and size on a card, and an image's pixel size. */
export type MediaFileFacts = Pick<FileDto, "filename" | "contentType" | "size" | "width" | "height">;

/** How an image opens larger: the viewer, and what opens it. A reader's click does; in the editor a click selects the block, so a double-click does. */
export interface MediaImageView {
  viewer: ImageViewerHandle;
  trigger: "click" | "double-click";
}

/** The name of the control that opens an image larger, on the image and in the editor's toolbar. */
export const OPEN_LARGER_LABEL = "Open larger";

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
  file: MediaFileFacts | null;
  /** Images only: lets the image open larger in place. */
  view?: MediaImageView | undefined;
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
  /** An image's stored pixel size, while it is believed. */
  shape: ImageDimensions | null;
  /** Checks a loaded image against its stored size. */
  onImage: (image: HTMLImageElement) => void;
  view: MediaImageView | undefined;
}

/**
 * An image's stored pixel size, until the loaded picture shows it is not
 * the picture's: the `width` attribute would otherwise draw it at the wrong
 * size for good. The bytes that stated the size are an uploader's.
 */
function useImageShape(file: MediaFileFacts | null): { shape: ImageDimensions | null; check: (image: HTMLImageElement) => void } {
  const stored = keptDimensions(file?.width, file?.height);
  const width = stored?.width ?? 0;
  const height = stored?.height ?? 0;
  const [wrong, setWrong] = useState(false);
  const check = useCallback((image: HTMLImageElement) => {
    if (width === 0 || !image.complete || image.naturalWidth === 0) return;
    if (image.naturalWidth !== width || image.naturalHeight !== height) setWrong(true);
  }, [width, height]);
  return { shape: wrong ? null : stored, check };
}

/** What opens the image larger: a click for a reader, a double-click in the editor. */
function openHandlers(view: MediaImageView | undefined) {
  if (!view) return {};
  return view.trigger === "click" ? { onClick: view.viewer.show } : { onDoubleClick: view.viewer.show };
}

function ImageElement({ url, alt, sized, loading, handlers, shape, onImage, view }: Omit<ElementProps, "kind">) {
  const { attach, onLoad, onError } = handlers;
  // With a stored size the image keeps its own box while it loads; without one a stand-in holds the place and the image waits behind it.
  const waiting = shape ? "animate-pulse bg-muted motion-reduce:animate-none" : "absolute inset-0 opacity-0";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize
    <img
      ref={(image) => {
        attach(image);
        if (image) onImage(image);
      }}
      src={url}
      alt={alt}
      width={shape?.width}
      height={shape?.height}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        onImage(event.currentTarget);
        onLoad();
      }}
      onError={onError}
      {...view?.viewer.marks}
      {...openHandlers(view)}
      className={cn("block h-auto max-h-[80vh] max-w-full rounded-lg object-contain", sized && "w-full", loading && waiting, view?.trigger === "click" && "cursor-zoom-in")}
    />
  );
}

function MediaElement({ kind, url, alt, sized, loading, handlers, shape, onImage, view }: ElementProps) {
  const { attach, onLoad, onError } = handlers;
  const hidden = loading ? "absolute inset-0 opacity-0" : "";
  if (kind === "video") {
    return <video ref={attach} src={url} controls preload="metadata" playsInline aria-label={alt || "Video"} onLoadedMetadata={onLoad} onError={onError} className={cn("block max-h-[80vh] w-full rounded-lg bg-muted", hidden)} />;
  }
  if (kind === "audio") {
    return <audio ref={attach} src={url} controls preload="metadata" aria-label={alt || "Audio"} onLoadedMetadata={onLoad} onError={onError} className={cn("block w-full", hidden)} />;
  }
  return <ImageElement url={url} alt={alt} sized={sized} loading={loading} handlers={handlers} shape={shape} onImage={onImage} view={view} />;
}

/** The reader's way to open an image larger from the keyboard; a click on the image does the same. */
function OpenLarger({ view }: { view: MediaImageView }) {
  return (
    <IconButton label={OPEN_LARGER_LABEL} onClick={view.viewer.show} className="absolute top-2 right-2 bg-card opacity-0 shadow-xs group-hover/image:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100">
      <IconArrowsMaximize />
    </IconButton>
  );
}

function wrapperClass(kind: MediaKind, sized: boolean): string {
  return cn("relative max-w-full", kind === "image" && !sized ? "w-fit" : "w-full", sized && "sm:w-(--media-width)");
}

/** The quiet box that holds a player's place while it loads. An image with a stored size holds its own. */
function LoadingStandIn({ kind }: { kind: MediaKind }) {
  return <div aria-hidden className={cn("w-full animate-pulse rounded-lg bg-muted", kind === "audio" ? "h-12" : "aspect-video min-w-60")} />;
}

type PlayableProps = Pick<MediaBlockProps, "kind" | "url" | "alt" | "width" | "overlay" | "file" | "view">;

/** The image or player in its box, with what is drawn over it. */
function MediaBox({ kind, url, alt, width, overlay, file, view, state, handlers }: PlayableProps & { state: MediaLoadState; handlers: MediaLoadHandlers }) {
  const { shape, check } = useImageShape(kind === "image" ? file : null);
  const sized = width !== null && hasAdjustableWidth(kind);
  const loading = state === "loading";
  const imageView = kind === "image" ? view : undefined;
  return (
    <div className={cn(wrapperClass(kind, sized), "group/image")} style={widthStyle(kind, width)} data-media-state={state}>
      {loading && !shape ? <LoadingStandIn kind={kind} /> : null}
      <MediaElement kind={kind} url={url} alt={alt} sized={sized} loading={loading} handlers={handlers} shape={shape} onImage={check} view={imageView} />
      {imageView?.trigger === "click" && state === "ready" ? <OpenLarger view={imageView} /> : null}
      {overlay}
    </div>
  );
}

function PlayableMedia(props: PlayableProps) {
  const { kind, url } = props;
  const [state, handlers, attempt] = useMediaLoad(kind);
  if (state === "failed") return <MediaNotice kind={kind} href={url} onRetry={handlers.retry}>{failedCopy[kind]}</MediaNotice>;
  const player = <MediaBox key={attempt} {...props} state={state} handlers={handlers} />;
  if (state !== "interrupted") return player;
  // The player stays where it stopped; Try again picks up from there.
  return (
    <>
      {player}
      <MediaNotice kind={kind} href={url} onRetry={handlers.resume}>{interruptedCopy[kind] ?? failedCopy[kind]}</MediaNotice>
    </>
  );
}

function fileFacts(file: MediaFileFacts | null, kind: MediaKind): string | null {
  if (file) return fileTypeLabel(file.contentType);
  return kind === "pdf" ? "PDF" : null;
}

function cardName(alt: string, file: MediaFileFacts | null, kind: MediaKind): string {
  if (alt) return alt;
  return file?.filename ?? (kind === "pdf" ? "PDF" : "Download file");
}

function MediaBody(props: MediaBlockProps) {
  const { kind, url, downloadUrl, alt, file } = props;
  if (kind !== "file" && kind !== "pdf") return <PlayableMedia kind={kind} url={url} alt={alt} width={props.width} overlay={props.overlay} file={file} view={props.view} />;
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
      {props.kind === "image" ? props.view?.viewer.dialog : null}
      {props.caption ? <figcaption className="w-full text-sm leading-5 text-muted-foreground">{props.caption}</figcaption> : null}
    </figure>
  );
}
