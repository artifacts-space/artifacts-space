import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * The artifact column of the /app shell. It reads like a document page: the
 * toolbar stays, and everything under it is one page that scrolls, title
 * block first. Phones keep one page that scrolls with the window, so every
 * scroll class here only takes effect from md up.
 *
 * - `detailSection`: the column. Its toolbar never scrolls.
 * - `detailOuter`: everything under the toolbar, and the one scroll box. The
 *   title block scrolls away with the body. It is a size container, so a CSV
 *   grid inside caps its own height at the pane's instead of running past it.
 * - `detailBody`: the artifact's body, under the title block. It never
 *   scrolls by itself; it takes focus so the keyboard scrolls the page.
 *
 * The scroll box is `relative`, so positioned elements inside a preview
 * (chart labels, screen-reader text) stay inside it instead of stretching
 * the page.
 */
export const detailSection = "flex min-w-0 flex-1 flex-col md:min-h-0";

export const detailOuter = [
  "relative flex flex-col md:min-h-0 md:flex-1",
  "md:overflow-y-auto md:overscroll-contain md:[container-type:size]",
  "md:[--data-grid-max-height:max(12rem,min(70vh,calc(100cqh_-_8rem)))]",
].join(" ");

// Room under the last section, so the end of the artifact never sits on the pane's bottom edge.
export const detailBody = "relative flex flex-1 flex-col pb-10 focus-visible:outline-2 focus-visible:-outline-offset-2";

/**
 * For each row that holds the content's column, above the body (share
 * notice, title, chips, meta line, save notices) and inside it (the body's
 * surface, the source, the Files section): the block gutter on both sides
 * (detailOuterClass), so every row's column is centered in the same width
 * and starts and ends at the same place. The page's scrollbar is outside
 * all of them alike.
 */
export const gutterRoom = "px-[var(--detail-gutter,0px)]";

/**
 * `detailOuter` for an artifact of this kind. An interface gets the block
 * gutter: room on both sides of the column for the block handles its editor
 * hangs left of each block; both sides, so the column stays centered. It
 * goes by the kind alone, so the title block never moves when View source
 * opens or the source stops parsing. Phones have no handles beside the
 * blocks, so none there. Every row reads the one variable (gutterRoom), so
 * the title and the body cannot leave different room.
 */
export function detailOuterClass(blockGutter: boolean): string {
  return blockGutter ? `${detailOuter} sm:[--detail-gutter:3.5rem]` : detailOuter;
}

/**
 * For what must stay in view while the page scrolls under it: a notice that
 * arrives (someone else saved, an agent saved) and a save that did not go
 * through. It sticks to the top of the scroll box, so it needs an opaque
 * surface of its own. The title block itself never sticks.
 */
export const pinnedInPane = "md:sticky md:top-0 md:z-10";

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
 * `remember` before the change, and the pane's scroll box returns to the
 * same share of the way down once the other mode renders. `bodyRef` is the
 * body inside it, for focus.
 */
export function useScrollPlace(mode: string) {
  const outerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const saved = useRef<number | null>(null);

  const remember = useCallback(() => {
    saved.current = outerRef.current ? scrollShare(outerRef.current) : 0;
  }, []);

  useLayoutEffect(() => {
    const share = saved.current;
    if (share === null) return;
    saved.current = null;
    const outer = outerRef.current;
    if (outer) outer.scrollTop = scrollTopForShare(share, outer);
  }, [mode]);

  return { outerRef, bodyRef, remember };
}
