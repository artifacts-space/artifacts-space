"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import type { PageAddress, PageAddressRequest } from "@/lib/page-files/address";
import { PAGE_ANSWER_MS, pageFramePath, pageLabelFor, pageMessages, pageOrigin, pageSandbox } from "@/lib/page-host/rules";
import { cn } from "@/lib/utils";

/**
 * Asks the server where a page loads its files from: the token for its
 * frame's address, for this viewer (src/lib/page-files/actions.ts). Null
 * when the viewer may not read the artifact, or it could not be made.
 */
export type PageAddressLoader = (request: PageAddressRequest) => Promise<PageAddress | null>;

interface PageHost {
  /** The page host's domain, or null where pages cannot run. */
  base: string | null;
  /** How the frames inside get the address of their page's files; null where a page's files cannot load (a fixture without them). */
  address: PageAddressLoader | null;
}

/*
 * The page host for the frames inside. There is none by default, so a page
 * that never set one up (a fixture, a static page) shows no frame; a real
 * page wraps its views in ServerPageHost, which hands over the server's
 * `pageHostBase()` and the action that makes page file addresses.
 */
const PageHostContext = createContext<PageHost>({ base: null, address: null });

/** Gives the page frames inside it the page host's domain (null when pages cannot run here), and how to ask for a page's files address. */
export function PageHostProvider({ base, address, children }: { base: string | null; address?: PageAddressLoader | undefined; children: ReactNode }) {
  const value = useMemo(() => ({ base, address: address ?? null }), [base, address]);
  return <PageHostContext value={value}>{children}</PageHostContext>;
}

/** Whether HTML pages can run on this page: a page host is set up. */
export function usePagesCanRun(): boolean {
  return useContext(PageHostContext).base !== null;
}

/** The version of the artifact the frames inside show, when it is one from History: its page files are the ones it had. */
const PageVersionContext = createContext<string | null>(null);

/** Tells the page frames inside that they show this version of the artifact (History), so they load the page files as that version had them. */
export function PageVersionProvider({ versionId, children }: { versionId: string | null; children: ReactNode }) {
  return <PageVersionContext value={versionId}>{children}</PageVersionContext>;
}

/** Where an artifact's page runs: its origin once the label is worked out, or that it could not be. */
interface PagePlace {
  origin: string | null;
  /** The label could not be worked out: the browser has no Web Crypto here (a site served over plain HTTP). */
  failed: boolean;
}

/** The origin of an artifact's page host. Null before the label is worked out, and where no page host is set up. */
function usePagePlace(pageKey: string): PagePlace {
  const { base } = useContext(PageHostContext);
  const [found, setFound] = useState<{ key: string; origin: string | null } | null>(null);
  const key = `${base ?? ""}\n${pageKey}`;
  useEffect(() => {
    if (!base) return undefined;
    let alive = true;
    pageLabelFor(pageKey)
      .then((label) => { if (alive) setFound({ key, origin: pageOrigin(label, base, window.location) }); })
      .catch(() => { if (alive) setFound({ key, origin: null }); });
    return () => { alive = false; };
  }, [pageKey, base, key]);
  const mine = found?.key === key ? found : null;
  return { origin: mine?.origin ?? null, failed: mine !== null && mine.origin === null };
}

/** How long before its end an address counts as ended, so a page never starts on one that ends while it loads. */
const ADDRESS_MARGIN_MS = 60_000;

/** A page files address the frame holds: which page and files it is for, and its token (null when none could be made). */
interface HeldAddress {
  key: string;
  /** The load of the page this address was last found good for. */
  load: string;
  token: string | null;
  /** When the token ends, in milliseconds; 0 for no token. */
  endsAt: number;
}

/**
 * The path the frame loads: `/`, or, for a page with files, its name under
 * the files address the server makes for this viewer (pageFramePath), so
 * the page's relative URLs reach its files. Null until an address is
 * settled for this load of the page. The address is asked for when the
 * page or its files change (`filesKey`), and again for a later load
 * (`load`) once it is near its end or when none could be made, so typing in
 * the editor does not ask for one per change and a load never starts on an
 * address that is about to end. When no address can be made, the page runs
 * at `/` without its files.
 *
 * A page that stays open is not given a new address while it runs, on
 * purpose: the token is part of the frame's address, so a new one would
 * load the page again and drop what the reader did in it. A file the page
 * first asks for after its address ended (10 to 15 minutes, pageTokenLimits)
 * gets a 404 until the next load; the guide tells agents to load what the
 * page needs when it starts.
 */
function usePagePath(pageKey: string, filesKey: string | undefined, load: string): string | null {
  const { address } = useContext(PageHostContext);
  const versionId = useContext(PageVersionContext);
  const [held, setHeld] = useState<HeldAddress | null>(null);
  const key = `${pageKey}\n${versionId ?? ""}\n${filesKey ?? ""}`;
  const wanted = filesKey !== undefined && address !== null;
  const mine = held?.key === key ? held : null;
  const settled = mine?.load === load;
  useEffect(() => {
    if (!wanted || settled) return undefined;
    let alive = true;
    // The address in hand still has time: this load uses it too. Otherwise the server makes a new one.
    const inHand = mine && mine.endsAt - ADDRESS_MARGIN_MS > Date.now() ? Promise.resolve({ token: mine.token, endsAt: mine.endsAt }) : null;
    const next = inHand ?? address({ pageKey, ...(versionId === null ? {} : { versionId }) }).then((made) => ({ token: made?.token ?? null, endsAt: made ? Date.parse(made.expiresAt) : 0 }));
    next
      .then((found) => { if (alive) setHeld({ key, load, ...found }); })
      .catch(() => { if (alive) setHeld({ key, load, token: null, endsAt: 0 }); });
    return () => { alive = false; };
  }, [wanted, settled, mine, address, pageKey, versionId, key, load]);
  if (!wanted) return pageFramePath(null);
  return mine && settled ? pageFramePath(mine.token) : null;
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
 *
 * The page is sent on each "ready" (a page that reloads itself loads the
 * frame document again), and on the frame's first load when nothing was
 * sent by then: the first "ready" is the only one that can come before
 * this listens. The listener is added in a layout effect, so even a frame
 * document from the browser's cache cannot answer first.
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
  const sentRef = useRef(false);
  const send = useCallback(() => {
    sentRef.current = true;
    frameRef.current?.contentWindow?.postMessage({ type: pageMessages.render, html }, origin);
  }, [frameRef, origin, html]);

  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== origin) return;
      const message = readMessage(event.data);
      if (message.type === pageMessages.ready) {
        send();
        ask();
      }
      if (message.type === pageMessages.pong && questionRef.current !== null && message.id === questionRef.current.id) settle();
      if (message.type === pageMessages.shown) setShown(true);
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); };
  }, [frameRef, origin, send, ask, settle]);
  useEffect(() => settle, [settle]);

  const onLoad = useCallback(() => {
    if (!sentRef.current) send();
    ask();
  }, [send, ask]);
  return { shown, onLoad };
}

interface PageWindowProps {
  origin: string;
  /** The frame document's path on the page host (pageFramePath). */
  path: string;
  html: string;
  title: string;
  onLeft: () => void;
}

/** One load of the frame document, with the page written into it. */
function PageWindow({ origin, path, html, title, onLeft }: PageWindowProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { shown, onLoad } = usePageHandshake({ frameRef, origin, html, onLeft });
  return (
    <iframe
      ref={frameRef}
      src={`${origin}${path}`}
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
  /** The artifact's public id: it decides the page's host, so the page's browser storage stays with the artifact. */
  pageKey: string;
  /** The page: a full HTML document. */
  html: string;
  /** The frame's accessible name. */
  title: string;
  /**
   * Set for a page that has page files: a text that changes whenever they do (a file added, removed, or replaced).
   * The frame then loads under the page's files address, and loads again when the text changes.
   */
  filesKey?: string | undefined;
  /** Sizes the frame: it fills this box, and the page scrolls inside it. */
  className?: string;
}

/**
 * An HTML artifact's page, running: scripts and all, in a sandboxed iframe
 * on the artifact's own page host, never on this site's origin
 * (src/lib/page-host/rules.ts). A page that sends its frame to another
 * address is closed, with a way to show it again. A page with page files
 * (`filesKey`) loads under the address the server makes for this viewer,
 * so its relative URLs reach those files (src/lib/page-files). Draws
 * nothing where no page host is set up; the caller shows the source there
 * (`usePagesCanRun`).
 */
export function PageFrame({ pageKey, html, title, filesKey, className }: PageFrameProps) {
  const { origin, failed } = usePagePlace(pageKey);
  const generation = useGeneration(html);
  const filesGeneration = useGeneration(filesKey ?? "");
  const [attempt, setAttempt] = useState(0);
  const load = `${String(generation)}.${String(filesGeneration)}:${String(attempt)}`;
  const path = usePagePath(pageKey, filesKey, load);
  const [leftLoad, setLeftLoad] = useState<string | null>(null);
  const onLeft = useCallback(() => { setLeftLoad(load); }, [load]);
  const showAgain = useCallback(() => { setAttempt((current) => current + 1); }, []);
  // Where the frame loads from, once both the page's host and its path are known.
  const place = origin && path !== null ? { origin, path } : null;
  return (
    <div data-slot="page-frame-box" aria-busy={place || failed ? undefined : true} className={cn("min-h-0 overflow-hidden", className)}>
      {failed ? <PageCannotStart /> : null}
      {place ? <PlacedPage key={load} place={place} left={leftLoad === load} html={html} title={title} onLeft={onLeft} onShowAgain={showAgain} /> : null}
    </div>
  );
}

interface PlacedPageProps {
  place: { origin: string; path: string };
  /** This load of the page left its frame, and was closed. */
  left: boolean;
  html: string;
  title: string;
  onLeft: () => void;
  onShowAgain: () => void;
}

/** One load of the page where it runs, or, once it left its frame, the note that it was closed. */
function PlacedPage({ place, left, html, title, onLeft, onShowAgain }: PlacedPageProps) {
  if (left) return <PageLeft onShowAgain={onShowAgain} />;
  return <PageWindow origin={place.origin} path={place.path} html={html} title={title} onLeft={onLeft} />;
}
