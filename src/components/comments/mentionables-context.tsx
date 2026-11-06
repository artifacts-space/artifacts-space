"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";

import { loadMentionablesAction } from "@/app/(workspace)/threads/actions";
import { composerMentionMap, type MentionDirectory, type Mentionable } from "@/lib/comments/mention-autocomplete";
import type { MentionKind } from "@/lib/comments/mentions";

interface MentionablesValue {
  /** People and agents a mention would reach. The viewer is not among them. */
  candidates: readonly Mentionable[];
  /** The viewer, when they have a handle. */
  self: Mentionable | null;
  /** Handles the composer highlights: the candidates and the viewer. */
  resolved: ReadonlyMap<string, MentionKind>;
}

const emptyDirectory: MentionDirectory = { candidates: [], self: null };
const MentionablesContext = createContext<MentionablesValue>({ candidates: [], self: null, resolved: new Map() });

/**
 * Loads who the viewer can mention on this artifact once, and shares the list
 * with every composer in the thread. Without the list, typing @ shows a short
 * hint instead of suggestions; mentions still work when typed in full.
 */
export function MentionablesProvider({ publicId, children }: { publicId: string; children: React.ReactNode }) {
  const [directory, setDirectory] = useState<MentionDirectory>(emptyDirectory);

  useEffect(() => {
    let active = true;
    loadMentionablesAction(publicId)
      .then((result) => {
        if (active && result.success) setDirectory(result.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [publicId]);

  const value = useMemo(() => ({ candidates: directory.candidates, self: directory.self, resolved: composerMentionMap(directory) }), [directory]);
  return <MentionablesContext value={value}>{children}</MentionablesContext>;
}

/** The people and agents the viewer can mention in this thread, and the handles to highlight. */
export function useMentionables(): MentionablesValue {
  return use(MentionablesContext);
}
