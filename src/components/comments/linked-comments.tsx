"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface LinkedComments {
  /** The artifact whose comments a link asked to open, until they open. */
  pending: string | null;
  consume: () => void;
}

const LinkedCommentsContext = createContext<LinkedComments>({ pending: null, consume: () => undefined });

/**
 * Holds the artifact whose comments the URL asked to open
 * (`/app?artifact=<id>&comments=1`), so the comments open once for that
 * artifact and not again after the person moves on.
 */
export function LinkedCommentsProvider({ publicId, children }: { publicId: string | null; children: React.ReactNode }) {
  const [pending, setPending] = useState(publicId);
  const consume = useCallback(() => { setPending(null); }, []);
  const value = useMemo(() => ({ pending, consume }), [pending, consume]);
  return <LinkedCommentsContext.Provider value={value}>{children}</LinkedCommentsContext.Provider>;
}

/** Whether a link asked to open this artifact's comments, and the call that marks it done. */
export function useLinkedComments(publicId: string): { linked: boolean; consume: () => void } {
  const { pending, consume } = useContext(LinkedCommentsContext);
  return { linked: pending === publicId, consume };
}
