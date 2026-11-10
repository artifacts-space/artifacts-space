"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { ArtifactLink } from "@/lib/app-link";

interface LinkedComments {
  /** The artifact whose comments a link asked to open, until they open. */
  pending: string | null;
  consume: () => void;
}

const LinkedCommentsContext = createContext<LinkedComments>({ pending: null, consume: () => undefined });

function pendingFor(link: ArtifactLink | null): string | null {
  return link?.comments ? link.publicId : null;
}

/**
 * Holds the artifact whose comments the URL asked to open
 * (`/app?artifact=<id>&comments=1`), so the comments open once for that
 * artifact and not again after the person moves on. `link` is the last link
 * that opened its artifact; each new one (even for the same artifact) asks
 * again, so a second click on a notification opens the comments again. The
 * request lapses when the person selects another artifact first (say, while
 * the linked one is still loading), so it never fires later on its own.
 */
export function LinkedCommentsProvider({ link, selectedPublicId, children }: { link: ArtifactLink | null; selectedPublicId: string | null; children: React.ReactNode }) {
  const [pending, setPending] = useState(() => pendingFor(link));
  const [seen, setSeen] = useState(link);
  let current = pending;
  if (link !== seen) {
    setSeen(link);
    current = pendingFor(link);
    setPending(current);
  }
  if (current !== null && current !== selectedPublicId) setPending(null);
  const consume = useCallback(() => { setPending(null); }, []);
  const value = useMemo(() => ({ pending, consume }), [pending, consume]);
  return <LinkedCommentsContext.Provider value={value}>{children}</LinkedCommentsContext.Provider>;
}

/** Whether a link asked to open this artifact's comments, and the call that marks it done (the Comments dialog opens on it). */
export function useLinkedComments(publicId: string): { linked: boolean; consume: () => void } {
  const { pending, consume } = useContext(LinkedCommentsContext);
  return { linked: pending === publicId, consume };
}
