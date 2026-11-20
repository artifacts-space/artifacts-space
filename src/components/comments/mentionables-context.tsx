"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import { loadMentionablesAction } from "@/app/(workspace)/threads/actions";
import { onSharingChanged } from "@/components/app/sharing-events";
import type { ActionResult } from "@/lib/artifact-types";
import { composerMentionMap, type MentionDirectory, type Mentionable } from "@/lib/comments/mention-autocomplete";
import type { MentionKind } from "@/lib/comments/mentions";

import { mentionListView, takeMentionAnswer, type MentionListLoaded } from "./mention-list-load";
import type { MentionListState } from "./mention-suggestions";
import { useRetryOnFocus } from "./use-retry-on-focus";

interface MentionablesValue {
  /** People and agents a mention would reach. The viewer is not among them. */
  candidates: readonly Mentionable[];
  /** The viewer, when they have a handle. */
  self: Mentionable | null;
  /** Handles the composer highlights: the candidates and the viewer. */
  resolved: ReadonlyMap<string, MentionKind>;
  /** Whether the newest list is here, on its way, or could not be loaded: the hint under "@" says which. */
  list: MentionListState;
}

/** How the list of people to mention is fetched: the server action, or an in-memory one on dev fixtures. */
export type LoadMentionables = (publicId: string) => Promise<ActionResult<MentionDirectory>>;

/** Outside a provider nothing is loading and nobody can be mentioned. */
const MentionablesContext = createContext<MentionablesValue>({ candidates: [], self: null, resolved: new Map(), list: "ready" });
const LoaderContext = createContext<LoadMentionables>(loadMentionablesAction);

/** Swaps how mentionables load for everything inside, as ThreadApi does for comments (dev fixtures run without a database). */
export function MentionablesLoader({ load, children }: { load: LoadMentionables; children: React.ReactNode }) {
  return <LoaderContext value={load}>{children}</LoaderContext>;
}

/**
 * Loads who the viewer can mention on this artifact once, and shares the list
 * with every composer in the thread. Without the list, typing @ shows a short
 * hint instead of suggestions; mentions still work when typed in full.
 *
 * Who a mention reaches follows who can read the artifact, so the list is
 * loaded again when the artifact's sharing is saved in this tab
 * (sharing-events.ts): a thread that stays on the page across a move to a
 * team offers the teammates at once. The list in hand stays until the new
 * one arrives, and stays if it cannot be loaded. The hint says only what is
 * known (`mentionListView`): "loading" until the newest request answers,
 * "could not be loaded" after it failed, and "nobody to mention" only of a
 * list that answered it. A failed load is asked for again when the window
 * next gets focus, never on a timer.
 */
export function MentionablesProvider({ publicId, children }: { publicId: string; children: React.ReactNode }) {
  const [loaded, setLoaded] = useState<MentionListLoaded | null>(null);
  /** Numbers the requests for the list: a save of this artifact's sharing, or a return to the window after a failure, asks again. */
  const [ask, setAsk] = useState(0);
  const load = use(LoaderContext);
  const askAgain = useCallback(() => { setAsk((count) => count + 1); }, []);

  useEffect(() => onSharingChanged(publicId, askAgain), [publicId, askAgain]);

  useEffect(() => {
    let active = true;
    const arrive = (directory: MentionDirectory | null) => {
      if (active) setLoaded((previous) => takeMentionAnswer(previous, { publicId, ask, directory }));
    };
    load(publicId)
      .then((result) => { arrive(result.success ? result.data : null); })
      .catch(() => { arrive(null); });
    return () => {
      active = false;
    };
  }, [load, publicId, ask]);

  const view = mentionListView(loaded, publicId, ask);
  useRetryOnFocus(view.failed, askAgain);
  const { directory, list } = view;
  const value = useMemo(() => ({ candidates: directory.candidates, self: directory.self, resolved: composerMentionMap(directory), list }), [directory, list]);
  return <MentionablesContext value={value}>{children}</MentionablesContext>;
}

/** The people and agents the viewer can mention in this thread, and the handles to highlight. */
export function useMentionables(): MentionablesValue {
  return use(MentionablesContext);
}
