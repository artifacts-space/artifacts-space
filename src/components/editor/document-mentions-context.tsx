"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";

import type { MentionSource } from "@/components/comments/comment-mentions";
import type { MentionListState } from "@/components/comments/mention-suggestions";
import { useRetryOnFocus } from "@/components/comments/use-retry-on-focus";
import type { ActionResult } from "@/lib/artifact-types";
import { composerMentionMap, type MentionDirectory } from "@/lib/comments/mention-autocomplete";

/** How the list of people to mention in a document is fetched: the server action (`loadDocumentMentionablesAction`), or an in-memory one on dev fixtures. */
export type LoadDocumentMentionables = (publicId: string) => Promise<ActionResult<MentionDirectory>>;

const emptyDirectory: MentionDirectory = { candidates: [], self: null };
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

/** What one load brought for an artifact: its list, or null when the list could not be loaded. */
interface Loaded {
  publicId: string;
  directory: MentionDirectory | null;
}

/** What is known of the list for this artifact: nothing has answered yet, the answer was a failure, or it is here. */
function listState(answer: Loaded | null): MentionListState {
  if (answer === null) return "loading";
  return answer.directory === null ? "unavailable" : "ready";
}

/**
 * Gives the document editor inside it @mentions for one saved artifact: who
 * the editor can name, loaded once after the editor is on screen. Until the
 * list arrives, typing @ says it is loading, and a handle typed in full still
 * reaches its owner: by the save, or once they can read the artifact. A list
 * that could not be loaded is asked for again when the window next gets
 * focus, never on a timer. Without an id (an artifact not stored
 * yet) or a loader, the editor has no @mentions. It always renders the same
 * tree, so an artifact that gets its id while it is being written keeps its
 * editor.
 */
export function DocumentMentionsProvider({ publicId, children }: { publicId: string | null; children: React.ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const load = use(LoaderContext);

  useEffect(() => {
    if (!load || !publicId) return;
    let active = true;
    const arrive = (directory: MentionDirectory | null) => {
      if (active) setLoaded({ publicId, directory });
    };
    load(publicId)
      .then((result) => { arrive(result.success ? result.data : null); })
      .catch(() => { arrive(null); });
    return () => { active = false; };
  }, [load, publicId, attempt]);

  // Another artifact's list is never offered: what was loaded counts only for the id it was loaded for.
  const mine = loaded?.publicId === publicId ? loaded : null;
  useRetryOnFocus(mine?.directory === null ? mine : null, () => { setAttempt((count) => count + 1); });
  const value = useMemo<MentionSource | null>(() => {
    if (!load || !publicId) return null;
    const directory = mine?.directory ?? emptyDirectory;
    return { candidates: directory.candidates, self: directory.self, resolved: composerMentionMap(directory), list: listState(mine) };
  }, [load, publicId, mine]);
  return <SourceContext value={value}>{children}</SourceContext>;
}

/** Who the document editor can mention, or null where documents have no @mentions. */
export function useDocumentMentions(): MentionSource | null {
  return use(SourceContext);
}
