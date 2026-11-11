"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { MediaKind } from "@/lib/files/media-rules";

/**
 * Whether an image or player in a media block loaded, for media-block.tsx.
 * `interrupted` is a player that loaded (at least its metadata) and then
 * failed, whether or not anyone pressed play: a dropped connection, or a
 * refused seek. It stays on the page where it stopped, and resume picks up at
 * the same moment instead of starting the file again.
 */
export type MediaLoadState = "loading" | "ready" | "failed" | "interrupted";

type LoadableElement = HTMLImageElement | HTMLMediaElement;

/** The handlers that report whether an image or player loaded. */
export interface MediaLoadHandlers {
  /** Reads the element's own state once it mounts: a server-rendered element may finish, or fail, before React attaches its handlers. */
  attach: (element: LoadableElement | null) => void;
  onLoad: () => void;
  onError: () => void;
  /** After a first-load failure: the element mounts again and asks for the file again. */
  retry: () => void;
  /** After an interruption: the player loads the file again and seeks back to where it stopped. */
  resume: () => void;
}

/** The state an element already reached before React attached its handlers, or null while it is still loading. */
function stateOf(element: LoadableElement): MediaLoadState | null {
  if (element instanceof HTMLImageElement) return element.complete ? (element.naturalWidth > 0 ? "ready" : "failed") : null;
  if (element.error) return "failed";
  return element.readyState >= HTMLMediaElement.HAVE_METADATA ? "ready" : null;
}

/** Where a failure leaves a block: a player that had loaded stays, interrupted; anything else failed to load. */
function afterError(current: MediaLoadState, kind: MediaKind): MediaLoadState {
  const playing = current === "ready" || current === "interrupted";
  return playing && (kind === "video" || kind === "audio") ? "interrupted" : "failed";
}

/**
 * Tracks one image or player, and how many times it was mounted (a key for
 * retry). PDFs and file cards always count as ready.
 */
export function useMediaLoad(kind: MediaKind): [MediaLoadState, MediaLoadHandlers, number] {
  const [state, setState] = useState<MediaLoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const element = useRef<LoadableElement | null>(null);
  const resumeAt = useRef<number | null>(null);

  const attach = useCallback((node: LoadableElement | null) => {
    element.current = node;
    const reached = node ? stateOf(node) : null;
    if (reached) setState(reached);
  }, []);

  const handlers = useMemo<MediaLoadHandlers>(() => ({
    attach,
    onLoad: () => {
      const node = element.current;
      if (node instanceof HTMLMediaElement && resumeAt.current !== null) node.currentTime = resumeAt.current;
      resumeAt.current = null;
      setState("ready");
    },
    onError: () => { setState((current) => afterError(current, kind)); },
    retry: () => {
      setState("loading");
      setAttempt((count) => count + 1);
    },
    resume: () => {
      const node = element.current;
      if (!(node instanceof HTMLMediaElement)) return;
      resumeAt.current = node.currentTime;
      setState("ready");
      node.load();
    },
  }), [attach, kind]);

  const tracked = kind === "image" || kind === "video" || kind === "audio";
  return [tracked ? state : "ready", handlers, attempt];
}
