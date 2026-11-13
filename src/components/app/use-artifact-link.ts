"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import { parseArtifactLinkSearch, withoutArtifactLink, withoutCommentHash, type ArtifactLink } from "@/lib/app-link";
import { linkedStart, linkNotice, openArtifactLink } from "@/lib/app-link-rules";
import type { ArtifactListItemDto } from "@/lib/artifact-types";

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
  list: RefObject<HTMLElement | null>;
  detail: RefObject<HTMLElement | null>;
}

/** The current URL without the link (and an old link's `#comment-<id>`): the address bar is the record of what is handled, so a link still there has not been acted on. */
function cleanLocation(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${withoutArtifactLink(search)}${withoutCommentHash(hash)}`;
}

/** The link in the address bar, with the comment an old thread link names in its fragment (the server never sees it). */
function linkInLocation(): ArtifactLink | null {
  return parseArtifactLinkSearch(new URLSearchParams(window.location.search), window.location.hash);
}

/**
 * The workspace's list and selection, driven by links as well as clicks.
 *
 * A link arrives when the address bar holds one (`?artifact=<id>`): on the
 * first load, and after each navigation to it while the workspace is open,
 * even to the same link twice, since the link leaves the address bar as soon
 * as it is acted on. The address bar, not the router's state or the page's
 * props, decides: Next can keep showing a link it has not caught up on, hand
 * a repeated navigation the same props, and restore an earlier page's props
 * on Back.
 *
 * Each link selects its artifact (pinning it to the top when it is not in
 * the list) without remounting the workspace, so search, filters, and panel
 * sizes stay. A link to an artifact that is gone sets `notice` to "gone", or
 * to "failed" when the server could not check it. `opened` is the last link
 * that opened its artifact, for its comments.
 */
export function useArtifactLink({ initialArtifacts, target = null, failed = false, onHandled, list, detail }: ArtifactLinkOptions) {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.toString();
  const [start] = useState(() => linkedStart(initialArtifacts, parseArtifactLinkSearch(params), target));
  const [artifacts, setArtifacts] = useState(start.artifacts);
  const [selectedId, setSelectedId] = useState(start.selectedId);
  const [notice, setNotice] = useState(() => linkNotice(start.unavailable, failed));
  const [opened, setOpened] = useState(start.opened);
  // The first load's link is already in the state above; it only needs forgetting.
  const startLink = useRef(parseArtifactLinkSearch(params) !== null);

  const arrive = useEffectEvent((link: ArtifactLink) => {
    const outcome = openArtifactLink(artifacts, link, target);
    setNotice(linkNotice(outcome.kind === "unavailable", failed));
    if (outcome.kind === "open") {
      setArtifacts(outcome.artifacts);
      setSelectedId(outcome.selectedId);
      setOpened(link);
    }
  });
  // Drops the link from the address bar at once, and from the router's own URL with a replace, so a reload,
  // Back, or a refresh after a save never hands it back. Next's own state keeps Next's router out of the first step.
  const forget = useEffectEvent(() => {
    const clean = cleanLocation();
    window.history.replaceState(window.history.state, "", clean);
    router.replace(clean, { scroll: false });
    onHandled?.();
  });

  // The first load's link was read on the server, which never sees a fragment: a comment named only there joins it here.
  const completeStart = useEffectEvent((link: ArtifactLink) => {
    if (start.opened && link.commentId !== start.opened.commentId) setOpened(link);
  });

  // Runs after each navigation commits: the search or the server's answer for it changes.
  useEffect(() => {
    const link = linkInLocation();
    if (!link) return;
    if (startLink.current) {
      startLink.current = false;
      completeStart(link);
    } else arrive(link);
    forget();
  }, [search, target, failed]);

  useRevealOpened(opened, list, detail);

  return { artifacts, setArtifacts, selectedId, setSelectedId, notice, dismissNotice: () => { setNotice(null); }, opened };
}
