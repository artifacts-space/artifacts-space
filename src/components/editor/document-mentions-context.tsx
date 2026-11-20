"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import type { MentionSource } from "@/components/comments/comment-mentions";
import { mentionListView, takeMentionAnswer, type MentionListLoaded } from "@/components/comments/mention-list-load";
import { useRetryOnFocus } from "@/components/comments/use-retry-on-focus";
import type { ActionResult } from "@/lib/artifact-types";
import { composerMentionMap, type MentionDirectory } from "@/lib/comments/mention-autocomplete";

/** How the list of people to mention in a document is fetched: the server action (`loadDocumentMentionablesAction`), or an in-memory one on dev fixtures. */
export type LoadDocumentMentionables = (publicId: string) => Promise<ActionResult<MentionDirectory>>;

/** Null outside a provider: an editor there (a new artifact, a Markdown block) has no @mentions. */
const SourceContext = createContext<MentionSource | null>(null);
/** Null where nothing offers the list: the document editors there have no @mentions, and nothing is fetched. */
const LoaderContext = createContext<LoadDocumentMentionables | null>(null);

/**
 * Turns on @mentions for the document editors inside, fetching the list this
 * way. The real pages pass the server action; dev fixtures pass an in-memory
 * list or leave it out.
 */
export function DocumentMentionsLoader({ load, children }: { load: LoadDocumentMentionables; children: React.ReactNode }) {
  return <LoaderContext value={load}>{children}</LoaderContext>;
}

/**
 * Gives the document editor inside it @mentions for one saved artifact: who
 * the editor can name, loaded once after the editor is on screen. Until the
 * list arrives, typing @ says it is loading, and a handle typed in full still
 * reaches its owner: by the save, or once they can read the artifact. A list
 * that could not be loaded is asked for again when the window next gets
 * focus, never on a timer. What the hint says is the comment box's rule
 * (`mentionListView`). Without an id (an artifact not stored
 * yet) or a loader, the editor has no @mentions. It always renders the same
 * tree, so an artifact that gets its id while it is being written keeps its
 * editor.
 */
export function DocumentMentionsProvider({ publicId, children }: { publicId: string | null; children: React.ReactNode }) {
  const [loaded, setLoaded] = useState<MentionListLoaded | null>(null);
  /** Numbers the requests for the list: a return to the window after a failure asks again. */
  const [ask, setAsk] = useState(0);
  const load = use(LoaderContext);
  const askAgain = useCallback(() => { setAsk((count) => count + 1); }, []);

  useEffect(() => {
    if (!load || !publicId) return;
    let active = true;
    const arrive = (directory: MentionDirectory | null) => {
      if (active) setLoaded((previous) => takeMentionAnswer(previous, { publicId, ask, directory }));
    };
    load(publicId)
      .then((result) => { arrive(result.success ? result.data : null); })
      .catch(() => { arrive(null); });
    return () => { active = false; };
  }, [load, publicId, ask]);

  // Another artifact's list is never offered: what was loaded counts only for the id it was loaded for.
  const view = load && publicId ? mentionListView(loaded, publicId, ask) : null;
  useRetryOnFocus(view?.failed ?? null, askAgain);
  const directory = view?.directory ?? null;
  const list = view?.list ?? "ready";
  const value = useMemo<MentionSource | null>(() => {
    if (!directory) return null;
    return { candidates: directory.candidates, self: directory.self, resolved: composerMentionMap(directory), list };
  }, [directory, list]);
  return <SourceContext value={value}>{children}</SourceContext>;
}

/** Who the document editor can mention, or null where documents have no @mentions. */
export function useDocumentMentions(): MentionSource | null {
  return use(SourceContext);
}
