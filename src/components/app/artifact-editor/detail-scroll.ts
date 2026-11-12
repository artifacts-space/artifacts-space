import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Scroll boxes for the artifact column of the /app shell (see `shell-tall`
 * and `shell-short` in globals.css). Phones keep one page that scrolls, so
 * every class here only takes effect from md up.
 *
 * - `detailSection`: the column. Its toolbar never scrolls.
 * - `detailOuter`: everything under the toolbar. On short viewports it is the
 *   scroll box, so the title block scrolls away and the save status bar sticks.
 * - `detailBody`: everything under the save status bar. On tall viewports it
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

/**
 * For each row above `detailBody` that holds the content's column (share
 * notice, title, chips, meta line, save notices): it leaves the room the
 * body leaves beside its own column, so both columns are centered in the
 * same width and start and end at the same place. That room is the body's
 * scrollbar (useScrollbarRoom) and, for an interface, the block gutter
 * (detailOuterClass).
 */
export const scrollbarRoom = "ps-[var(--detail-gutter,0px)] pe-[calc(var(--detail-gutter,0px)_+_var(--detail-scrollbar,0px))]";

/**
 * For each row inside `detailBody` that holds the content's column (the
 * body's surface, the source, the Files section): the block gutter on both
 * sides. The scrollbar is already outside these rows.
 */
export const gutterRoom = "px-[var(--detail-gutter,0px)]";

/**
 * `detailOuter` for an artifact of this kind. An interface gets the block
 * gutter: room on both sides of the column for the block handles its editor
 * hangs left of each block; both sides, so the column stays centered. It
 * goes by the kind alone, so the title block never moves when View source
 * opens or the source stops parsing. Phones have no handles beside the
 * blocks, so none there. Every row reads the one variable (scrollbarRoom,
 * gutterRoom), so the title and the body cannot leave different room.
 */
export function detailOuterClass(blockGutter: boolean): string {
  return blockGutter ? `${detailOuter} sm:[--detail-gutter:3.5rem]` : detailOuter;
}

/** The meta line on short viewports: it sticks to the top of the scroll box, opaque on the pane's card colour. */
export const stickyModeBar = "shell-short:sticky shell-short:top-0 shell-short:z-10 shell-short:bg-card";

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
 * Keeps the reader's place when the page and its source switch: call
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

/** The room a scroll box's own scrollbar takes beside its content, in px: 0 with overlay scrollbars or when nothing scrolls. */
export function scrollbarWidth(box: { offsetWidth: number; clientWidth: number }): number {
  return Math.max(0, box.offsetWidth - box.clientWidth);
}

/**
 * Publishes the width of `detailBody`'s scrollbar as `--detail-scrollbar` on
 * `detailOuter`. A scrollbar that takes room (Windows, Linux, and macOS with
 * "Show scroll bars: Always") narrows the body, so its centered column would
 * sit half a scrollbar left of the title above it; rows with `scrollbarRoom`
 * leave the same room and stay lined up. The width is 0 with overlay
 * scrollbars and whenever the body does not scroll.
 */
export function useScrollbarRoom(outer: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const target = outer.current;
    const box = body.current;
    if (!target || !box) return;
    const publish = () => { target.style.setProperty("--detail-scrollbar", `${String(scrollbarWidth(box))}px`); };
    publish();
    // A scrollbar that appears or goes narrows or widens the body's content box, which is what this observes.
    const observer = new ResizeObserver(publish);
    observer.observe(box);
    return () => { observer.disconnect(); };
  }, [outer, body]);
}
