import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Scroll boxes for the artifact column of the /app shell (see `shell-tall`
 * and `shell-short` in globals.css). Phones keep one page that scrolls, so
 * every class here only takes effect from md up.
 *
 * - `detailSection`: the column. Its toolbar never scrolls.
 * - `detailOuter`: everything under the toolbar. On short viewports it is the
 *   scroll box, so the title block scrolls away and the Edit/Preview bar sticks.
 * - `detailBody`: everything under the Edit/Preview bar. On tall viewports it
 *   is the scroll box. It is a size container, so a CSV grid inside caps its
 *   own height at the pane's instead of running past it (one scroll at a time).
 *
 * Every scroll box is `relative`, so positioned elements inside a preview
 * (chart labels, screen-reader text) stay inside it instead of stretching
 * the page.
 */
export const detailSection = "flex min-w-0 flex-1 flex-col md:min-h-0";

export const detailOuter = "relative flex flex-col md:min-h-0 md:flex-1 shell-short:overflow-y-auto shell-short:overscroll-contain";

export const detailBody = [
  // Room under the last section, so the end of the artifact never sits on the pane's bottom edge.
  "relative flex flex-1 flex-col pb-10",
  "shell-tall:min-h-0 shell-tall:overflow-y-auto shell-tall:overscroll-contain shell-tall:[container-type:size]",
  "shell-tall:[--data-grid-max-height:max(12rem,min(70vh,calc(100cqh_-_8rem)))]",
  "focus-visible:outline-2 focus-visible:-outline-offset-2",
].join(" ");

/** The Edit/Preview bar on short viewports: it sticks to the top of the scroll box, opaque, in the colour it has today over the card. */
export const stickyModeBar = "shell-short:sticky shell-short:top-0 shell-short:z-10 shell-short:bg-[color-mix(in_srgb,var(--background)_60%,var(--card))]";

interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far down a scroll box is, from 0 at the top to 1 at the bottom; 0 when it cannot scroll. */
export function scrollShare(box: ScrollBox): number {
  const range = box.scrollHeight - box.clientHeight;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, box.scrollTop / range));
}

/** The scrollTop that puts a scroll box the same share of the way down. */
export function scrollTopForShare(share: number, box: Omit<ScrollBox, "scrollTop">): number {
  return Math.round(share * Math.max(0, box.scrollHeight - box.clientHeight));
}

/**
 * Keeps the reader's place when the Edit/Preview mode changes: call
 * `remember` before the change, and both scroll boxes return to the same
 * share of the way down once the other mode renders.
 */
export function useScrollPlace(mode: string) {
  const outerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const saved = useRef<{ outer: number; body: number } | null>(null);

  const remember = useCallback(() => {
    saved.current = {
      outer: outerRef.current ? scrollShare(outerRef.current) : 0,
      body: bodyRef.current ? scrollShare(bodyRef.current) : 0,
    };
  }, []);

  useLayoutEffect(() => {
    const place = saved.current;
    if (!place) return;
    saved.current = null;
    const outer = outerRef.current;
    const body = bodyRef.current;
    if (outer) outer.scrollTop = scrollTopForShare(place.outer, outer);
    if (body) body.scrollTop = scrollTopForShare(place.body, body);
  }, [mode]);

  return { outerRef, bodyRef, remember };
}
