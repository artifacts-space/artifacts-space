"use client";

import { createContext, use, useEffect, useState } from "react";

import { loadMentionablesAction } from "@/app/(workspace)/threads/actions";
import type { Mentionable } from "@/lib/comments/mention-autocomplete";

const MentionablesContext = createContext<readonly Mentionable[]>([]);

/**
 * Loads who the viewer can mention on this artifact once, and shares the list
 * with every composer in the thread. Without the list, typing @ simply shows
 * no suggestions; mentions still work when typed in full.
 */
export function MentionablesProvider({ publicId, children }: { publicId: string; children: React.ReactNode }) {
  const [mentionables, setMentionables] = useState<readonly Mentionable[]>([]);

  useEffect(() => {
    let active = true;
    loadMentionablesAction(publicId)
      .then((result) => {
        if (active && result.success) setMentionables(result.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [publicId]);

  return <MentionablesContext value={mentionables}>{children}</MentionablesContext>;
}

/** The people and agents the viewer can mention in this thread. */
export function useMentionables(): readonly Mentionable[] {
  return use(MentionablesContext);
}
