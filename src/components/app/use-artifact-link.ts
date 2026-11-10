"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type RefObject } from "react";

import { parseArtifactLinkSearch, withoutArtifactLink, type ArtifactLink } from "@/lib/app-link";
import { linkedStart, openArtifactLink } from "@/lib/app-link-rules";
import type { ArtifactListItemDto } from "@/lib/artifact-types";

/**
 * Drops the link from the address bar and from the router once it has
 * opened, so a reload, Back, or a refresh after a save does not hand it back.
 * The state must not be Next's own (`window.history.state`): Next then skips
 * its router, which keeps the link in the URL it refreshes.
 */
function useForgetArtifactLink(search: string) {
  useEffect(() => {
    const { pathname, search: current, hash } = window.location;
    const rest = withoutArtifactLink(current);
    if (rest !== current) window.history.replaceState(null, "", `${pathname}${rest}${hash}`);
  }, [search]);
}

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

/** What the workspace says about a link that did not open: its artifact is gone, or it could not be checked just now. */
export type LinkNotice = "gone" | "failed";

function linkNotice(unavailable: boolean, failed: boolean): LinkNotice | null {
  if (!unavailable) return null;
  return failed ? "failed" : "gone";
}

interface ArtifactLinkOptions {
  initialArtifacts: ArtifactListItemDto[];
  /** What the server found for the URL's link through the access check, or null when it is missing or not readable. */
  target?: ArtifactListItemDto | null | undefined;
  /** The server could not check the link just now (a read limit, or a database error), so it may still be there. */
  failed?: boolean | undefined;
  list: RefObject<HTMLElement | null>;
  detail: RefObject<HTMLElement | null>;
}

/**
 * The workspace's list and selection, driven by links as well as clicks.
 *
 * A link arrives when the URL's query string holds one (`?artifact=<id>`):
 * on the first load, and on each navigation to it while the workspace is
 * open, even to the same link twice, since the link leaves the URL as soon
 * as it opens. The URL, not the page's props, is the signal: Next can hand a
 * repeated navigation the same props, and Back restores an earlier page's.
 *
 * Each link selects its artifact (pinning it to the top when it is not in
 * the list) without remounting the workspace, so search, filters, and panel
 * sizes stay. A link to an artifact that is gone sets `notice` to "gone", or
 * to "failed" when the server could not check it. `opened` is the last link
 * that opened its artifact, for its comments.
 */
export function useArtifactLink({ initialArtifacts, target = null, failed = false, list, detail }: ArtifactLinkOptions) {
  const params = useSearchParams();
  const search = params.toString();
  const [start] = useState(() => linkedStart(initialArtifacts, parseArtifactLinkSearch(params), target));
  const [artifacts, setArtifacts] = useState(start.artifacts);
  const [selectedId, setSelectedId] = useState(start.selectedId);
  const [notice, setNotice] = useState(() => linkNotice(start.unavailable, failed));
  const [opened, setOpened] = useState(start.opened);
  const [seenSearch, setSeenSearch] = useState(search);

  // A new link while the workspace is open (a soft navigation): act on it during render, as React advises for changing inputs.
  const fresh = search === seenSearch ? null : parseArtifactLinkSearch(params);
  if (search !== seenSearch) setSeenSearch(search);
  if (fresh) {
    const outcome = openArtifactLink(artifacts, fresh, target);
    setNotice(linkNotice(outcome.kind === "unavailable", failed));
    if (outcome.kind === "open") {
      setArtifacts(outcome.artifacts);
      setSelectedId(outcome.selectedId);
      setOpened(fresh);
    }
  }

  useForgetArtifactLink(search);
  useRevealOpened(opened, list, detail);

  return { artifacts, setArtifacts, selectedId, setSelectedId, notice, dismissNotice: () => { setNotice(null); }, opened };
}
