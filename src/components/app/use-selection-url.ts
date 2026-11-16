"use client";

import { useEffect, useRef } from "react";

import { withoutCommentHash } from "@/lib/app-link";
import { namedArtifact, selectionUrlWrite, type SelectionIntent, type UrlWrite } from "@/lib/workspace-url-rules";

/**
 * What the workspace's link handling and its selection share about the
 * address bar: why the open artifact is about to change (read once, then
 * forgotten), and a note of each query string the selection writes, so a
 * change the workspace made itself is never taken for a new link.
 */
export interface UrlSync {
  takeIntent: () => SelectionIntent;
  wrote: (search: string) => void;
  /** Notes the artifact plain /app shows (chosen implicitly), so Back to plain /app opens it again. */
  showsPlain: (publicId: string | null) => void;
}

/**
 * Writes the query string to the address bar, keeping the path and any
 * fragment but an old link's `#comment-<id>`, and returns the query string
 * the browser now shows. The native history API, not the router: Next
 * follows these writes (useSearchParams updates) without asking the server
 * for the page again, so opening an artifact stays instant.
 */
export function writeUrl({ mode, search }: UrlWrite): string {
  const url = `${window.location.pathname}${search}${withoutCommentHash(window.location.hash)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  return window.location.search;
}

/**
 * Keeps the address bar naming the open artifact (`selected`):
 * the person's pick pushes a history entry, a fallback with nothing chosen
 * replaces it with plain /app, and a change the address bar led (a link,
 * Back, Forward) writes nothing. The first render writes nothing either:
 * opening plain /app keeps it plain.
 */
export function useSelectionInUrl(selected: { publicId: string } | null, sync: UrlSync) {
  const shown = selected?.publicId ?? null;
  const previous = useRef(shown);
  const { takeIntent, wrote, showsPlain } = sync;
  useEffect(() => {
    if (previous.current === shown) return;
    previous.current = shown;
    const write = selectionUrlWrite(window.location.search, shown, takeIntent());
    if (write) wrote(writeUrl(write));
    if (!namedArtifact(window.location.search)) showsPlain(shown);
  }, [shown, takeIntent, wrote, showsPlain]);
}
