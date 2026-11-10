"use client";

import { useEffect, useState, type RefObject } from "react";

import { withoutArtifactLink, type ArtifactLink } from "@/lib/app-link";
import { linkedStart, openArtifactLink } from "@/lib/app-link-rules";
import type { ArtifactListItemDto } from "@/lib/artifact-types";

/**
 * Links this tab has already acted on. Every navigation hands the workspace a
 * new link object, so a second click on the same notification opens it
 * again, while Back, which restores an earlier page with its old link, does
 * not jump back to that artifact or reopen its comments.
 */
const handledLinks = new WeakSet<ArtifactLink>();

function freshLink(link: ArtifactLink | null): ArtifactLink | null {
  return link && !handledLinks.has(link) ? link : null;
}

/** Drops the link from the address bar, so a reload or a later pick does not jump back, and marks it handled. */
function useForgetArtifactLink(link: ArtifactLink | null) {
  useEffect(() => {
    if (!link) return;
    handledLinks.add(link);
    const { pathname, search, hash } = window.location;
    const rest = withoutArtifactLink(search);
    if (rest !== search) window.history.replaceState(window.history.state, "", `${pathname}${rest}${hash}`);
  }, [link]);
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

interface ArtifactLinkOptions {
  initialArtifacts: ArtifactListItemDto[];
  /** The link in the URL (`?artifact=<id>`), a new object on each navigation. */
  link: ArtifactLink | null;
  /** What the server found for the link through the access check, or null when it is missing or not readable. */
  target: ArtifactListItemDto | null;
  list: RefObject<HTMLElement | null>;
  detail: RefObject<HTMLElement | null>;
}

/**
 * The workspace's list and selection, driven by links as well as clicks.
 * Each new link selects its artifact (pinning it to the top when it is not
 * in the list) without remounting the workspace, so search, filters, and
 * panel sizes stay. A link to an artifact that is gone sets `unavailable`.
 * `opened` is the last link that opened its artifact, for its comments.
 */
export function useArtifactLink({ initialArtifacts, link, target, list, detail }: ArtifactLinkOptions) {
  const [start] = useState(() => linkedStart(initialArtifacts, freshLink(link), target));
  const [artifacts, setArtifacts] = useState(start.artifacts);
  const [selectedId, setSelectedId] = useState(start.selectedId);
  const [unavailable, setUnavailable] = useState(start.unavailable);
  const [opened, setOpened] = useState(start.opened);
  const [seen, setSeen] = useState(link);

  // A new link while the workspace is open (a soft navigation): act on it during render, as React advises for props that change.
  const fresh = link === seen ? null : freshLink(link);
  if (link !== seen) setSeen(link);
  if (fresh) {
    const outcome = openArtifactLink(artifacts, fresh, target);
    setUnavailable(outcome.kind === "unavailable");
    if (outcome.kind === "open") {
      setArtifacts(outcome.artifacts);
      setSelectedId(outcome.selectedId);
      setOpened(fresh);
    }
  }

  useForgetArtifactLink(link);
  useRevealOpened(opened, list, detail);

  return { artifacts, setArtifacts, selectedId, setSelectedId, unavailable, dismissUnavailable: () => { setUnavailable(false); }, opened };
}
