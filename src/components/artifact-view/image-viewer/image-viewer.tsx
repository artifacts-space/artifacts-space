"use client";

import { Dialog } from "@base-ui/react/dialog";
import { IconChevronLeft, IconChevronRight, IconDownload, IconX } from "@tabler/icons-react";
import { useContext, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { imagePlaceWords } from "@/lib/block-links/image-view-rules";

import { ThemeScope } from "../theme-scope";
import { ThemeSourceContext } from "../theme-scope-context";
import type { ViewerImage } from "./document-images";

interface ImageViewerProps {
  /** The document's images, in order. */
  images: readonly ViewerImage[];
  /** Which one is shown. */
  index: number;
  /** Shows the image `delta` places on. */
  onStep: (delta: number) => void;
  onClose: () => void;
  /** Where the focus goes when the viewer closes, or null to leave it to the dialog. */
  returnFocus: () => HTMLElement | null;
}

function StepButton({ delta, disabled, onStep }: { delta: -1 | 1; disabled: boolean; onStep: (delta: number) => void }) {
  const Icon = delta < 0 ? IconChevronLeft : IconChevronRight;
  return (
    // At an end the button stays focusable: a button that loses the focus as it turns off would take the arrow keys with it.
    <Button type="button" variant="outline" size="icon" aria-label={delta < 0 ? "Previous image" : "Next image"} disabled={disabled} focusableWhenDisabled onClick={() => { onStep(delta); }} className="shrink-0 bg-background">
      <Icon aria-hidden />
    </Button>
  );
}

/** The picture between Previous and Next, with its caption under it. */
function Stage({ image, first, last, many, onStep }: { image: ViewerImage; first: boolean; last: boolean; many: boolean; onStep: (delta: number) => void }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 items-center gap-2 px-2 pb-2 sm:gap-4 sm:px-4">
        {many ? <StepButton delta={-1} disabled={first} onStep={onStep} /> : null}
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- the address the page already loaded: an access-checked redirect to R2, which next/image cannot optimize */}
          <img key={image.src} src={image.src} alt={image.alt} width={image.width ?? undefined} height={image.height ?? undefined} className="h-auto max-h-full w-auto max-w-full rounded-lg object-contain" />
        </div>
        {many ? <StepButton delta={1} disabled={last} onStep={onStep} /> : null}
      </div>
      {image.caption ? <p className="shrink-0 px-4 pb-4 text-center text-sm leading-5 text-muted-foreground">{image.caption}</p> : null}
    </>
  );
}

/**
 * One image of a document, as large as the window allows, over the whole
 * window: a dialog, so Escape closes it, the focus stays in it, and the
 * page behind cannot be used. It shows the address the page already loaded
 * the image from, at the size the page already knows, so nothing new is
 * asked for and nothing moves when it opens. Left and Right step through
 * the document's images. Pinch zoom is the browser's own.
 *
 * A dialog is drawn at the end of the document, outside the artifact's
 * ThemeScope, so it applies the same theme (ThemeSourceContext), as the
 * canvas board's full screen does. Nothing in it is the document's text.
 */
export function ImageViewer({ images, index, onStep, onClose, returnFocus }: ImageViewerProps) {
  const source = useContext(ThemeSourceContext);
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = images[index];
  if (!image) return null;
  const many = images.length > 1;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!many || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft") onStep(-1);
    if (event.key === "ArrowRight") onStep(1);
  };
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Popup
          data-image-viewer=""
          data-comment-skip=""
          initialFocus={closeRef}
          finalFocus={() => returnFocus() ?? true}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 outline-none"
        >
          <ThemeScope theme={source?.theme} mode={source?.mode} className="flex h-full flex-col bg-background text-foreground">
            <div className="flex shrink-0 items-center gap-2 px-4 py-2">
              <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-medium">{image.alt || "Image"}</Dialog.Title>
              {many ? <p data-image-place="" className="shrink-0 text-sm text-muted-foreground tabular-nums">{imagePlaceWords(index, images.length)}</p> : null}
              {image.downloadUrl ? (
                <Button variant="ghost" size="icon-sm" nativeButton={false} render={<a href={image.downloadUrl} aria-label="Download" />}><IconDownload aria-hidden /></Button>
              ) : null}
              <Dialog.Close ref={closeRef} render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}><IconX aria-hidden /></Dialog.Close>
            </div>
            <Stage image={image} first={index === 0} last={index === images.length - 1} many={many} onStep={onStep} />
          </ThemeScope>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
