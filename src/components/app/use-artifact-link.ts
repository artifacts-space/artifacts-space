"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";

import { loadArtifactAction } from "@/app/(workspace)/app/actions";
import { parseArtifactLinkSearch, withoutCommentHash, type ArtifactLink } from "@/lib/app-link";
import { linkedStart, linkNotice } from "@/lib/app-link-rules";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ActionResult, ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import { addressStep, namedArtifact, searchNaming, type SelectionIntent } from "@/lib/workspace-url-rules";

import type { ArtifactLoader } from "./use-full-artifact";
import { writeUrl, type UrlSync } from "./use-selection-url";

/** Phones (below md) scroll the page, and the list sits above the artifact there. */
const phoneLayout = "(width < 48rem)";

/**
 * Brings the opened artifact into view: its card in the list, and on phones
 * the artifact itself, just under the sticky header.
 */
function useRevealOpened(opened: ArtifactLink | null, list: RefObject<HTMLElement | null>, detail: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!opened) return;
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
    const target = detail.current?.firstElementChild;
    if (!target || !window.matchMedia(phoneLayout).matches) return;
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - header, behavior: "instant" });
  }, [opened, list, detail]);
}

interface ArtifactLinkOptions {
  initialArtifacts: ArtifactListItemDto[];
  /** What the server found for the URL's link through the access check, or null when it is missing or not readable. */
  target?: ArtifactListItemDto | null | undefined;
  /** The server could not check the link just now (a read limit, or a database error), so it may still be there. */
  failed?: boolean | undefined;
  /** Called each time a link in the address bar is acted on. */
  onHandled?: (() => void) | undefined;
  /** Loads an artifact Back or Forward names that the list does not hold: the server action, or a fixture's stand-in. */
  loadArtifact?: ArtifactLoader | undefined;
  list: RefObject<HTMLElement | null>;
  detail: RefObject<HTMLElement | null>;
}

/**
 * The first load's link: in the browser, read from the address bar with its
 * fragment, so the comments open at an old link's comment from the start and
 * never open first without it. The server render has no fragment; nothing it
 * draws depends on the comment (only effects act on it), so both agree.
 */
function firstLink(params: URLSearchParams): ArtifactLink | null {
  return typeof window === "undefined" ? parseArtifactLinkSearch(params) : parseArtifactLinkSearch(params, window.location.hash);
}

/** Replaces the address bar's query string with `search` when it (or an old link's `#comment-<id>`) differs; returns the query string shown. */
function settleUrl(search: string): string {
  const { search: now, hash } = window.location;
  if (search === now && withoutCommentHash(hash) === hash) return now;
  return writeUrl({ mode: "replace", search });
}

/** The list with `item` first, and no other copy of it. */
function pinned(artifacts: ArtifactListItemDto[], item: ArtifactListItemDto): ArtifactListItemDto[] {
  return [item, ...artifacts.filter((artifact) => artifact.id !== item.id)];
}

/**
 * The workspace's list and selection, driven by the address bar as well as
 * clicks. The address bar names the open artifact (`?artifact=<id>`), so it
 * can be copied, bookmarked, reloaded, and walked with Back and Forward.
 *
 * A link arrives when the address bar names an artifact the workspace did
 * not put there: on the first load, and after each navigation to a link
 * while the workspace is open (a notification, say), even to the same link
 * twice. It selects its artifact (pinning it to the top when it is not in
 * the list) without remounting the workspace, so search, filters, and panel
 * sizes stay. Its `comments=1` and `comment=<id>` act once: they leave the
 * address bar with a replace, and `artifact=` stays. A link to an artifact
 * that is gone sets `notice` to "gone", or to "failed" when the server could
 * not check it, and the address bar goes back to what it named before.
 *
 * Back and Forward open the artifact the entry names the same way, adding no
 * entry: from the list, else the server's answer, else loaded through the
 * access check, else the notice. Plain /app opens what it showed before.
 * Links and Back are told apart by nothing but the URL (an entry Back
 * reaches never holds comment params), since React can draw Next's
 * traversal before the browser's `popstate` reaches any listener of ours.
 * `opened` is the last artifact a link or Back opened, for its comments and
 * to bring it into view.
 *
 * `pick` is for the person's own choice (it pushes a history entry, through
 * `useSelectionInUrl`), and `afterDelete` for the selection that follows a
 * delete, with nothing chosen (plain /app, replaced).
 */
export function useArtifactLink({ initialArtifacts, target = null, failed = false, onHandled, loadArtifact = loadArtifactAction, list, detail }: ArtifactLinkOptions) {
  const params = useSearchParams();
  const search = params.toString();
  const [start] = useState(() => linkedStart(initialArtifacts, firstLink(params), target));
  const [artifacts, setArtifacts] = useState(start.artifacts);
  const [selectedId, setSelectedId] = useState(start.selectedId);
  const [notice, setNotice] = useState(() => linkNotice(start.unavailable, failed));
  const [opened, setOpened] = useState(start.opened);
  /** Artifacts the address bar's changes loaded in full, so the pane opens them without loading them again. */
  const [held, setHeld] = useState<readonly ArtifactDto[]>([]);
  const written = useRef<string | null>(null);
  const intent = useRef<SelectionIntent>(null);
  /** Artifacts deleted in this visit, so Back to one says it is gone instead of opening an older answer of the server. */
  const deleted = useRef<Set<string>>(new Set());
  /** The artifact plain /app shows, chosen implicitly: the first load's when it named none. */
  const plainShown = useRef(start.opened ? null : (start.artifacts.find((artifact) => artifact.id === start.selectedId)?.publicId ?? null));
  const urlSync = useMemo<UrlSync>(() => ({
    takeIntent: () => {
      const current = intent.current;
      intent.current = null;
      return current;
    },
    wrote: (search) => { written.current = search; },
    showsPlain: (publicId) => { plainShown.current = publicId; },
  }), []);

  /** Opens what a load found for the address bar, unless the person has moved on; else says so and names what is open again. */
  const landLoaded = (result: ActionResult<ArtifactDto> | null, link: ArtifactLink, entry: string, previous: string) => {
    if (window.location.search !== entry) return;
    if (result?.success) {
      const full = result.data;
      setHeld((current) => [...current.filter((artifact) => artifact.id !== full.id), full]);
      setArtifacts((current) => pinned(current, toArtifactListItem(full)));
      setSelectedId(full.id);
      setOpened(link);
      setNotice(null);
      written.current = settleUrl(searchNaming(entry, full.publicId));
      return;
    }
    setNotice(result ? "gone" : "failed");
    written.current = settleUrl(searchNaming(entry, namedArtifact(previous)));
  };

  /**
   * A change of the address bar the workspace did not write (a link, Back, Forward): opens what it names, adding no
   * entry, and drops a link's one-shot params. What cannot be opened shows the notice, and the address bar goes back
   * to what it named before.
   */
  const follow = useEffectEvent((now: string) => {
    const previous = written.current ?? "";
    written.current = now;
    intent.current = null;
    const link = parseArtifactLinkSearch(new URLSearchParams(now), window.location.hash);
    onHandled?.();
    const step = addressStep({ artifacts, link, target, failed, plainShown: plainShown.current, deleted: deleted.current });
    if (step.kind === "open") {
      setNotice(null);
      setArtifacts(step.artifacts);
      setSelectedId(step.selectedId);
      setOpened(link ?? { publicId: step.publicId, comments: false });
      written.current = settleUrl(searchNaming(now, link ? step.publicId : null));
      return;
    }
    if (step.kind === "failed") {
      setNotice("failed");
      written.current = settleUrl(searchNaming(now, namedArtifact(previous)));
    }
    if (step.kind !== "load" || !link) return;
    loadArtifact(step.publicId)
      .then((result) => { landLoaded(result, link, now, previous); })
      .catch(() => { landLoaded(null, link, now, previous); });
  });

  /**
   * The first load: its link is already in the state above; only its one-shot params need dropping. When the
   * address bar has already moved on from what the page was drawn for (Back pressed into an entry this page did
   * not write, before the workspace was ready), it opens what the address bar names, as Back does.
   */
  const settleFirst = useEffectEvent(() => {
    // Until the write below lands, the address bar still holds the link: noted as ours, so a second run of this
    // effect (React runs it twice in development) does not take it for a new link.
    const now = window.location.search;
    if (namedArtifact(now) !== namedArtifact(search)) {
      written.current = search ? `?${search}` : "";
      follow(now);
      return;
    }
    written.current = now;
    if (!parseArtifactLinkSearch(new URLSearchParams(now))) return;
    const next = searchNaming(now, start.opened?.publicId ?? null);
    onHandled?.();
    // The first commit's effects can run before Next's router takes over the history API, and Next would then put
    // the old URL back on its next update. A microtask runs after all of them, so Next follows this write.
    queueMicrotask(() => { written.current = settleUrl(next); });
  });

  // Runs after each navigation commits (the search, or the server's answer for it, changes) and after each write of ours.
  useEffect(() => {
    if (written.current === null) {
      settleFirst();
      return;
    }
    const now = window.location.search;
    if (now !== written.current) follow(now);
  }, [search, target, failed]);

  useRevealOpened(opened, list, detail);

  const pick = useCallback((id: string) => {
    intent.current = "push";
    setSelectedId(id);
  }, []);
  const afterDelete = useCallback((removedId: string, nextId: string) => {
    deleted.current.add(removedId);
    intent.current = "clear";
    setSelectedId(nextId);
  }, []);

  return { artifacts, setArtifacts, selectedId, pick, afterDelete, notice, dismissNotice: () => { setNotice(null); }, opened, held, urlSync };
}
