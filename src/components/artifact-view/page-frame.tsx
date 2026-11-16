"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { PAGE_ANSWER_MS, pageLabelFor, pageMessages, pageOrigin, pageSandbox } from "@/lib/page-host/rules";
import { cn } from "@/lib/utils";

/*
 * The page host's domain for the frames inside. There is none by default, so
 * a page that never set one up (a fixture, a static page) shows no frame;
 * a real page wraps its views in PageHostProvider with the server's
 * `pageHostBase()`.
 */
const PageHostContext = createContext<string | null>(null);

/** Gives the page frames inside it the page host's domain, or null when pages cannot run here. */
export function PageHostProvider({ base, children }: { base: string | null; children: ReactNode }) {
  return <PageHostContext value={base}>{children}</PageHostContext>;
}

/** Whether HTML pages can run on this page: a page host is set up. */
export function usePagesCanRun(): boolean {
  return useContext(PageHostContext) !== null;
}

/** The origin of an artifact's page host, once its label is worked out; null before that and where no page host is set up. */
function usePageOrigin(artifactId: string): string | null {
  const base = useContext(PageHostContext);
  const [found, setFound] = useState<{ key: string; origin: string } | null>(null);
  const key = `${base ?? ""}\n${artifactId}`;
  useEffect(() => {
    if (!base) return undefined;
    let alive = true;
    pageLabelFor(artifactId)
      .then((label) => { if (alive) setFound({ key, origin: pageOrigin(label, base, window.location) }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [artifactId, base, key]);
  return found?.key === key ? found.origin : null;
}

/** Counts up each time the HTML changes, so a new version loads in a fresh frame document. */
function useGeneration(html: string): number {
  const [shown, setShown] = useState({ html, generation: 0 });
  if (shown.html !== html) setShown({ html, generation: shown.generation + 1 });
  return shown.html === html ? shown.generation : shown.generation + 1;
}

/** The `type` and `nonce` of a message from the frame, when it has them. */
function readMessage(data: unknown): { type: unknown; nonce: unknown } {
  if (typeof data !== "object" || data === null) return { type: null, nonce: null };
  return { type: "type" in data ? data.type : null, nonce: "nonce" in data ? data.nonce : null };
}

interface Handshake {
  frameRef: RefObject<HTMLIFrameElement | null>;
  origin: string;
  html: string;
  /** The frame holds another document: the page sent it to another address. */
  onLeft: () => void;
}

/**
 * The site's side of the frame document's protocol
 * (src/lib/page-host/frame-document.ts). The frame document says it is
 * ready; this answers with the page and a word only the two of them know.
 * Each time the frame loads something, this asks the frame document for
 * the word. No answer within PAGE_ANSWER_MS means the frame holds another
 * document, and `onLeft` closes it. Messages go to the page host's origin
 * only, so another document in the frame never gets the page.
 */
function usePageHandshake({ frameRef, origin, html, onLeft }: Handshake) {
  const [nonce] = useState(() => crypto.randomUUID());
  const [shown, setShown] = useState(false);
  const waitingRef = useRef<number | null>(null);

  const answered = useCallback(() => {
    if (waitingRef.current !== null) window.clearTimeout(waitingRef.current);
    waitingRef.current = null;
  }, []);
  const ask = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: pageMessages.ping }, origin);
    waitingRef.current ??= window.setTimeout(onLeft, PAGE_ANSWER_MS);
  }, [frameRef, origin, onLeft]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== origin) return;
      const message = readMessage(event.data);
      if (message.type === pageMessages.ready) {
        frame.postMessage({ type: pageMessages.render, html, nonce }, origin);
        ask();
      }
      if (message.type === pageMessages.pong && message.nonce === nonce) answered();
      if (message.type === pageMessages.shown) setShown(true);
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); };
  }, [frameRef, origin, html, nonce, ask, answered]);
  useEffect(() => answered, [answered]);

  return { shown, onLoad: ask };
}

interface PageWindowProps {
  origin: string;
  html: string;
  title: string;
  onLeft: () => void;
}

/** One load of the frame document, with the page written into it. */
function PageWindow({ origin, html, title, onLeft }: PageWindowProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { shown, onLoad } = usePageHandshake({ frameRef, origin, html, onLeft });
  return (
    <iframe
      ref={frameRef}
      src={`${origin}/`}
      title={title}
      sandbox={pageSandbox}
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      data-slot="page-frame"
      data-page-shown={shown ? "" : undefined}
      // A page without colors of its own is black on white, as in a browser tab, whatever this site's theme.
      className="block size-full border-0 bg-[Canvas] [color-scheme:light]"
    />
  );
}

/** Shown in place of a frame that left its page: what happened, and a way back. */
function PageLeft({ onShowAgain }: { onShowAgain: () => void }) {
  return (
    <div role="status" data-slot="page-frame-left" className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-md text-sm leading-6 text-muted-foreground">This page tried to show another address in its place, so it was closed.</p>
      <Button type="button" variant="outline" size="sm" onClick={onShowAgain}>Show the page again</Button>
    </div>
  );
}

interface PageFrameProps {
  /** The artifact the page belongs to: it decides the page's host, so its browser storage stays with it. */
  artifactId: string;
  /** The page: a full HTML document. */
  html: string;
  /** The frame's accessible name. */
  title: string;
  /** Sizes the frame: it fills this box, and the page scrolls inside it. */
  className?: string;
}

/**
 * An HTML artifact's page, running: scripts and all, in a sandboxed iframe
 * on the artifact's own page host, never on this site's origin
 * (src/lib/page-host/rules.ts). A page that sends its frame to another
 * address is closed, with a way to show it again. Draws nothing where no
 * page host is set up; the caller shows the source there (`usePagesCanRun`).
 */
export function PageFrame({ artifactId, html, title, className }: PageFrameProps) {
  const origin = usePageOrigin(artifactId);
  const generation = useGeneration(html);
  const [attempt, setAttempt] = useState(0);
  const load = `${String(generation)}:${String(attempt)}`;
  const [leftLoad, setLeftLoad] = useState<string | null>(null);
  const onLeft = useCallback(() => { setLeftLoad(load); }, [load]);
  const showAgain = useCallback(() => { setAttempt((current) => current + 1); }, []);
  return (
    <div data-slot="page-frame-box" aria-busy={origin ? undefined : true} className={cn("min-h-0 overflow-hidden", className)}>
      {origin && leftLoad !== load ? <PageWindow key={load} origin={origin} html={html} title={title} onLeft={onLeft} /> : null}
      {origin && leftLoad === load ? <PageLeft onShowAgain={showAgain} /> : null}
    </div>
  );
}
