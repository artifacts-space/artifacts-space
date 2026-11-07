"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** How long the panes take to fade out before a replay starts again, in ms. */
const REWIND_MS = 450;

/**
 * Plays the demo while it is on screen. The server renders the finished
 * session. On the first sighting the panes fade out and demo.css replays
 * every beat from the start (`data-play`). A CSS delay counts only once, so
 * each loop cancels and replays every animation inside the board. A loop
 * that comes due while the board is off screen, or the tab is hidden, waits
 * and replays when it comes back. Reduced motion keeps the finished session.
 */
export function DemoReplay({ cycleMs, className, children }: { cycleMs: number; className?: string; children: ReactNode }) {
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof board.getAnimations !== "function" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    let due = false;
    let started = false;
    let timer = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (visible && !document.hidden) replay();
        else due = true;
      }, cycleMs);
    };

    const replay = () => {
      due = false;
      board.dataset.rewind = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (started) {
          for (const animation of board.getAnimations({ subtree: true })) {
            animation.cancel();
            animation.play();
          }
        }
        started = true;
        board.dataset.play = "";
        delete board.dataset.rewind;
        schedule();
      }, REWIND_MS);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible = entry.isIntersecting;
          if (visible && (!started || due) && !document.hidden) replay();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(board);

    const onVisibility = () => {
      if (!document.hidden && visible && due) replay();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cycleMs]);

  return (
    <div ref={boardRef} className={className}>
      {children}
    </div>
  );
}
