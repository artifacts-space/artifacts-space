"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface AnnouncerValue {
  /** Speaks a line through the interface's live region. */
  announce: (text: string) => void;
  /** False until the interface has been drawn once: what is there from the start is not news. */
  ready: { current: boolean };
}

const AnnouncerContext = createContext<AnnouncerValue | null>(null);

/** How long a spoken line stays in the region: long enough to be read out, short enough not to be found later as stray text. */
const spokenLineMs = 8000;

/**
 * One polite live region for an interface, kept mounted for as long as the
 * interface is. A screen reader announces text added to a live region that
 * is already on the page; an element that arrives carrying a live role of
 * its own is announced unreliably. So elements marked `announce` hand their
 * words to this region when they appear. Each interface root has its own,
 * so two frames on a canvas never speak for each other.
 */
export function Announcer({ children }: { children: ReactNode }) {
  const [spoken, setSpoken] = useState<{ id: number; text: string } | null>(null);
  const ready = useRef(false);
  const count = useRef(0);
  const announce = useCallback((text: string) => {
    count.current += 1;
    setSpoken({ id: count.current, text });
  }, []);
  useEffect(() => {
    // A parent's effect runs after its children's, so elements drawn with the interface find `ready` false.
    ready.current = true;
    return () => { ready.current = false; };
  }, []);
  useEffect(() => {
    if (!spoken) return;
    const timer = window.setTimeout(() => { setSpoken((current) => (current?.id === spoken.id ? null : current)); }, spokenLineMs);
    return () => { window.clearTimeout(timer); };
  }, [spoken]);
  const value = useMemo(() => ({ announce, ready }), [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" data-ui-announcer="" data-comment-skip="" className="sr-only">
        {/* A new key for each line, so the same words said twice are spoken twice. */}
        {spoken ? <span key={spoken.id}>{spoken.text}</span> : null}
      </div>
    </AnnouncerContext.Provider>
  );
}

/**
 * Speaks `text` when the element appears after the interface was first
 * drawn, and again when its words change. It does nothing without
 * `enabled`, on the first draw, and outside an interface root (the editor).
 */
export function useAnnounced(text: string | undefined, enabled: boolean | undefined): void {
  const announcer = useContext(AnnouncerContext);
  useEffect(() => {
    if (!enabled || !text || !announcer?.ready.current) return;
    announcer.announce(text);
  }, [announcer, enabled, text]);
}
