"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";

import type { MentionSource } from "@/components/comments/comment-mentions";
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

/**
 * Gives the document editor inside it @mentions for one saved artifact: who
 * the editor can name, loaded once after the editor is on screen. Until the
 * list arrives, typing @ shows a short hint, and a handle typed in full still
 * notifies when the document is saved.
 */
export function DocumentMentionsProvider({ publicId, children }: { publicId: string; children: React.ReactNode }) {
  const [directory, setDirectory] = useState<MentionDirectory>(emptyDirectory);
  const load = use(LoaderContext);

  useEffect(() => {
    if (!load) return;
    let active = true;
    load(publicId)
      .then((result) => {
        if (active && result.success) setDirectory(result.data);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [load, publicId]);

  const value = useMemo<MentionSource>(() => ({ candidates: directory.candidates, self: directory.self, resolved: composerMentionMap(directory) }), [directory]);
  return <SourceContext value={load ? value : null}>{children}</SourceContext>;
}

/** Who the document editor can mention, or null where documents have no @mentions. */
export function useDocumentMentions(): MentionSource | null {
  return use(SourceContext);
}
