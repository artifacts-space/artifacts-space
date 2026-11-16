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

/** Where an artifact's page runs: its origin once the label is worked out, or that it could not be. */
interface PagePlace {
  origin: string | null;
  /** The label could not be worked out: the browser has no Web Crypto here (a site served over plain HTTP). */
  failed: boolean;
}

/** The origin of an artifact's page host. Null before the label is worked out, and where no page host is set up. */
function usePagePlace(artifactId: string): PagePlace {
  const base = useContext(PageHostContext);
  const [found, setFound] = useState<{ key: string; origin: string | null } | null>(null);
  const key = `${base ?? ""}\n${artifactId}`;
  useEffect(() => {
    if (!base) return undefined;
    let alive = true;
    pageLabelFor(artifactId)
      .then((label) => { if (alive) setFound({ key, origin: pageOrigin(label, base, window.location) }); })
      .catch(() => { if (alive) setFound({ key, origin: null }); });
    return () => { alive = false; };
  }, [artifactId, base, key]);
  const mine = found?.key === key ? found : null;
  return { origin: mine?.origin ?? null, failed: mine !== null && mine.origin === null };
}

/** Counts up each time the HTML changes, so a new version loads in a fresh frame document. */
function useGeneration(html: string): number {
  const [shown, setShown] = useState({ html, generation: 0 });
  if (shown.html !== html) setShown({ html, generation: shown.generation + 1 });
  return shown.html === html ? shown.generation : shown.generation + 1;
}

/** The `type` and `id` of a message from the frame, when it has them. */
function readMessage(data: unknown): { type: unknown; id: unknown } {
  if (typeof data !== "object" || data === null) return { type: null, id: null };
  return { type: "type" in data ? data.type : null, id: "id" in data ? data.id : null };
}

interface Handshake {
  frameRef: RefObject<HTMLIFrameElement | null>;
  origin: string;
  html: string;
  /** The frame holds another document: the page sent it to another address. */
  onLeft: () => void;
}

/** A question the site asked the frame and still waits on: its id, and the timer that closes the frame. */
interface OpenQuestion {
  id: string;
  timer: number;
}

/**
 * The site's side of the frame document's protocol
 * (src/lib/page-host/frame-document.ts). The frame document says it is
 * ready; this answers with the page, to the page host's origin only, so a
 * document of another origin in the frame never gets it.
 *
 * Each time the frame loads something, this asks "is a document of the
 * page host still in the frame?", with a fresh id. An answer counts only
 * from the frame's window, from the page host's origin, with that id. No
 * such answer within PAGE_ANSWER_MS means the page sent its frame to
 * another address, and `onLeft` closes it. Whatever else the frame posts is
 * the page's word: it is read for nothing but "ready" and "shown".
 */
function usePageHandshake({ frameRef, origin, html, onLeft }: Handshake) {
  const [shown, setShown] = useState(false);
  const questionRef = useRef<OpenQuestion | null>(null);

  const ask = useCallback(() => {
    // One question at a time: a second load keeps the first question's deadline, with a new id to answer.
    const timer = questionRef.current?.timer ?? window.setTimeout(onLeft, PAGE_ANSWER_MS);
    const id = crypto.randomUUID();
    questionRef.current = { id, timer };
    frameRef.current?.contentWindow?.postMessage({ type: pageMessages.ping, id }, origin);
  }, [frameRef, origin, onLeft]);
  const settle = useCallback(() => {
    if (questionRef.current) window.clearTimeout(questionRef.current.timer);
    questionRef.current = null;
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== origin) return;
      const message = readMessage(event.data);
      if (message.type === pageMessages.ready) {
        frame.postMessage({ type: pageMessages.render, html }, origin);
        ask();
      }
      if (message.type === pageMessages.pong && questionRef.current !== null && message.id === questionRef.current.id) settle();
      if (message.type === pageMessages.shown) setShown(true);
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); };
  }, [frameRef, origin, html, ask, settle]);
  useEffect(() => settle, [settle]);

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

/** Shown where the page's host could not be worked out. */
function PageCannotStart() {
  return (
    <div role="status" data-slot="page-frame-failed" className="flex size-full items-center justify-center p-6 text-center">
      <p className="max-w-md text-sm leading-6 text-muted-foreground">This page could not start in this browser. Open the site over HTTPS, then load it again.</p>
    </div>
  );
}

/** Shown in place of a frame that left its page: what happened, and a way back. */
function PageLeft({ onShowAgain }: { onShowAgain: () => void }) {
  return (
    <div role="status" data-slot="page-frame-left" className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-md text-sm leading-6 text-muted-foreground">This page stopped answering, or tried to show another address in its place, so it was closed.</p>
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
  const { origin, failed } = usePagePlace(artifactId);
  const generation = useGeneration(html);
  const [attempt, setAttempt] = useState(0);
  const load = `${String(generation)}:${String(attempt)}`;
  const [leftLoad, setLeftLoad] = useState<string | null>(null);
  const onLeft = useCallback(() => { setLeftLoad(load); }, [load]);
  const showAgain = useCallback(() => { setAttempt((current) => current + 1); }, []);
  return (
    <div data-slot="page-frame-box" aria-busy={origin || failed ? undefined : true} className={cn("min-h-0 overflow-hidden", className)}>
      {failed ? <PageCannotStart /> : null}
      {origin && leftLoad !== load ? <PageWindow key={load} origin={origin} html={html} title={title} onLeft={onLeft} /> : null}
      {origin && leftLoad === load ? <PageLeft onShowAgain={showAgain} /> : null}
    </div>
  );
}
