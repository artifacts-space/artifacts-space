"use client";

import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { CodeBlock } from "@/components/code/code-block";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PageFrame, usePagesCanRun } from "./page-frame";
import { ViewNotice } from "./view-notice";

/** The key every sample and preview shares when the caller names no artifact. */
const samplePage = "sample";

/** The name of the button that puts the page over the whole window, as on the canvas board. */
export const pageFullScreenLabel = "Full screen";

/** The page's box in the artifact: a window-like box that the page scrolls inside. */
const boxInPage = "h-[min(80dvh,60rem)] min-h-96 rounded-lg border";
/**
 * The same box over the whole window. It is shown in the browser's top layer (`popover`, see useTopLayer), whose
 * own styles these replace: no margin, edge, or padding, and the window's size instead of the content's.
 */
const boxOnScreen = "fixed inset-0 z-50 m-0 size-auto max-h-none max-w-none overscroll-contain border-0 p-0";

/**
 * Puts the box in the browser's top layer while `on`, and brings the focus to the bar's button after each change
 * (the button is another one in each place). The top layer is what makes the box cover the window: a fixed box
 * alone is held inside the nearest ancestor that contains its layout, and the /app pane's body is one (a size
 * container). The box never moves in the document, so its frame keeps its page. A browser without `popover` gets
 * the fixed box, which covers what its ancestors let it.
 */
function useTopLayer(on: boolean, box: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>) {
  const was = useRef(on);
  useLayoutEffect(() => {
    const element = box.current;
    if (on && element && "showPopover" in element && !element.matches(":popover-open")) element.showPopover();
    // Only after a change: the page's first draw takes no focus.
    if (was.current !== on) bar.current?.querySelector("button")?.focus({ preventScroll: true });
    was.current = on;
  }, [on, box, bar]);
}

/**
 * While the page covers the window: Escape leaves full screen, the document
 * behind does not scroll, and focus stays in the box (the bar and the page),
 * because everything else is covered. Escape reaches this site only while
 * focus is in the bar; inside the page, keys are the page's, so the bar's
 * button is always there.
 */
function useWholeWindow(on: boolean, box: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>, onExit: () => void) {
  useEffect(() => {
    if (!on) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onExit();
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) bar.current?.querySelector("button")?.focus();
    };
    const root = document.documentElement;
    const scroll = root.style.overflow;
    root.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      root.style.overflow = scroll;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [on, box, bar, onExit]);
}

/**
 * The running page with a bar of this site's above it. The bar's button puts
 * the box over the whole window and back. The box and its frame stay the
 * same elements in both places, so the page keeps running and keeps what
 * the reader did in it; a second frame would load the page again.
 *
 * The bar stays in full screen, with the artifact's title: a page that
 * anyone wrote never has the whole window to itself, where it could pose as
 * this site. The frame has no permission to go full screen by itself.
 */
function PageWindow({ content, title, pageKey }: { content: string; title: string; pageKey: string }) {
  const [fullScreen, setFullScreen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const exit = useCallback(() => { setFullScreen(false); }, []);
  useWholeWindow(fullScreen, box, bar, exit);
  useTopLayer(fullScreen, box, bar);
  return (
    <div
      ref={box}
      data-slot="html-page"
      data-full-screen={fullScreen ? "" : undefined}
      {...(fullScreen ? { popover: "manual", role: "dialog", "aria-modal": true, "aria-label": `${title}, full screen` } : {})}
      className={cn("flex min-w-0 flex-col overflow-hidden bg-background text-foreground", fullScreen ? boxOnScreen : boxInPage)}
    >
      <div ref={bar} data-slot="html-page-bar" data-comment-skip="" className="flex h-9 shrink-0 items-center gap-2 border-b pr-1 pl-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{fullScreen ? title : null}</span>
        {fullScreen ? (
          // Words, not a tooltip: a tooltip is drawn in the page, under the top layer.
          <Button type="button" variant="ghost" size="sm" onClick={exit} className="text-muted-foreground hover:text-foreground">
            <IconArrowsMinimize aria-hidden /> Exit full screen
          </Button>
        ) : (
          <IconButton label={pageFullScreenLabel} onClick={() => { setFullScreen(true); }}>
            <IconArrowsMaximize />
          </IconButton>
        )}
      </div>
      <PageFrame pageKey={pageKey} html={content} title={title} className="flex-1" />
    </div>
  );
}

/**
 * An HTML artifact: the page, running in a sandbox on its own page host
 * (page-frame.tsx), in a window-like box that the page scrolls inside, or
 * over the whole window (PageWindow). Where no page host is set up, the
 * page cannot run, so its source shows with a note. The page's scripts
 * never run on this site's origin.
 */
export function HtmlView({ content, title, pageKey }: { content: string; title: string; pageKey?: string | undefined }) {
  const canRun = usePagesCanRun();
  if (!canRun) {
    return (
      <div className="min-w-0 space-y-3">
        <ViewNotice title="This page cannot run here, so its source is shown.">Pages with scripts run on a separate page host, and none is set up for this page.</ViewNotice>
        <CodeBlock code={content} language="html" lines={null} />
      </div>
    );
  }
  const key = pageKey ?? samplePage;
  // Keyed by the artifact: full screen is about the page the reader put there, never the next one shown in its place.
  return <PageWindow key={key} content={content} title={title} pageKey={key} />;
}
