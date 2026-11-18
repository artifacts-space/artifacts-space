"use client";

import { IconZoomIn } from "@tabler/icons-react";
import { useRef, useState, type ReactNode } from "react";

import { ScrollFrame } from "@/components/code/scroll-frame";
import { IconButton } from "@/components/icon-button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A diagram that opens larger with a click. A click
 * on the image opens it, and so does a Zoom in button for keyboards and
 * screen readers (shown on hover and focus, always on touch screens). The
 * dialog fills its width with the diagram (up to twice its drawn size, never
 * below it) and scrolls when it is bigger than the screen. Closing it puts
 * the focus on Zoom in, the diagram's own control, so the keyboard carries
 * on from the diagram (in the editor too, where the focus was in the text
 * before the click).
 */
export function DiagramZoom({ src, width, height, label, children }: { src: string; width: number; height: number; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const show = () => { setOpen(true); };
  const zoomButton = () => frame.current?.querySelector<HTMLElement>(":scope > button") ?? true;
  return (
    <div ref={frame} className="group/zoom relative flex min-w-0 justify-center-safe">
      {/* The image keeps its own role and name; the button below is the keyboard path. */}
      <div className="flex min-w-0 cursor-zoom-in justify-center-safe" onClick={show}>{children}</div>
      <IconButton label="Zoom in" onClick={show} className="absolute -top-4 -right-2 bg-card opacity-0 group-hover/zoom:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 sm:-right-4">
        <IconZoomIn />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent finalFocus={zoomButton} className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[calc(100%-4rem)]">
          <DialogTitle className="pr-8">{label}</DialogTitle>
          {/* Larger than a phone's screen, it scrolls both ways; while it does it is a tab stop, so the keyboard can scroll it too. */}
          <ScrollFrame label={label} className="flex min-h-0 justify-center-safe overflow-auto rounded-lg bg-card p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI image, which next/image cannot optimize */}
            <img data-diagram-zoom="" src={src} width={width} height={height} alt={label} className="h-auto max-w-none shrink-0" style={{ width: `min(${String(width * 2)}px, max(100%, ${String(width)}px))` }} />
          </ScrollFrame>
        </DialogContent>
      </Dialog>
    </div>
  );
}
