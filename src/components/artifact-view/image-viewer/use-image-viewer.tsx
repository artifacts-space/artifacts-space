"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { stepImage } from "@/lib/block-links/image-view-rules";

import { documentImages, firstImageOf, imageByKey, imageMarks, readImage, type ViewerImage } from "./document-images";
import { leaveImageView, openImageView, pushImageView, replaceImageView, watchImageView } from "./image-view-history";
import { ImageViewer } from "./image-viewer";

/** What a block that draws an image gets to open it larger in place. */
export interface ImageViewerHandle {
  /** Attributes for the block's `<img>`: they mark it as one of the document's images. */
  marks: Record<`data-${string}`, string>;
  /** Opens this block's image larger. */
  show: () => void;
  /** The open viewer, or null. Draw it anywhere in the block. */
  dialog: ReactNode;
}

interface OpenView {
  images: ViewerImage[];
  index: number;
  /** True when opening added a history entry (a click); false when the reader arrived on one (a link, or Forward). */
  added: boolean;
}

/**
 * Lets a block open its image larger in place (ImageViewer). The viewer
 * steps through the images of the same document, read from the page when
 * it opens. Opening adds one history entry whose address names the image,
 * so Back closes it and the address is a link: the first block that shows
 * that file opens it when a reader arrives. `enabled` is false for a block
 * that shows no image; it then does nothing.
 */
export function useImageViewer({ fileId, downloadUrl, enabled, focusOnClose }: { fileId: string; downloadUrl: string; enabled: boolean; focusOnClose?: (image: HTMLImageElement) => HTMLElement | null }): ImageViewerHandle {
  const viewKey = useId();
  const [view, setView] = useState<OpenView | null>(null);
  const viewRef = useRef<OpenView | null>(null);
  /** The image that was shown when the viewer last closed: the focus goes back to it. */
  const lastShown = useRef<HTMLImageElement | null>(null);
  const change = useCallback((next: OpenView | null) => {
    const current = viewRef.current;
    if (!next && current) lastShown.current = current.images[current.index]?.element ?? null;
    viewRef.current = next;
    setView(next);
  }, []);

  const openHere = useCallback((added: boolean): boolean => {
    const element = imageByKey(viewKey);
    if (!element) return false;
    const elements = documentImages(element);
    change({ images: elements.map(readImage), index: Math.max(0, elements.indexOf(element)), added });
    return true;
  }, [change, viewKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    // Back and Forward, and a link someone arrives on: the address says which image is open.
    const follow = (openFileId: string | null) => {
      if (viewRef.current) {
        if (openFileId === null) change(null);
        return;
      }
      if (openFileId === fileId.toLowerCase() && firstImageOf(fileId) === imageByKey(viewKey)) openHere(false);
    };
    const stop = watchImageView(follow);
    const frame = requestAnimationFrame(() => { follow(openImageView()); });
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  }, [change, enabled, fileId, openHere, viewKey]);

  const show = useCallback(() => {
    if (!enabled || viewRef.current) return;
    if (openHere(true)) pushImageView(fileId);
  }, [enabled, fileId, openHere]);

  const step = useCallback((delta: number) => {
    const current = viewRef.current;
    if (!current) return;
    const index = stepImage(current.index, current.images.length, delta);
    const next = current.images[index];
    if (index === current.index || !next) return;
    change({ ...current, index });
    replaceImageView(next.fileId);
  }, [change]);

  const close = useCallback(() => {
    const current = viewRef.current;
    if (!current) return;
    const shown = current.images[current.index];
    change(null);
    // The page behind is left at the image that was last looked at.
    if (shown?.element.isConnected && shown.element !== imageByKey(viewKey)) shown.element.scrollIntoView({ block: "center" });
    leaveImageView(shown?.fileId ?? fileId, current.added);
  }, [change, fileId, viewKey]);

  const returnFocus = useCallback(() => {
    const element = lastShown.current?.isConnected ? lastShown.current : imageByKey(viewKey);
    return element && focusOnClose ? focusOnClose(element) : null;
  }, [focusOnClose, viewKey]);

  const marks = useMemo(() => imageMarks(fileId, downloadUrl, viewKey), [fileId, downloadUrl, viewKey]);
  const dialog = view ? <ImageViewer images={view.images} index={view.index} onStep={step} onClose={close} returnFocus={returnFocus} /> : null;
  return { marks, show, dialog };
}
