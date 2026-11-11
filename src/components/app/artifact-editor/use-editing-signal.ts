import { useEffect, useRef } from "react";

import { shouldSignalEditing } from "@/lib/edits/edit-conflict-rules";

import type { ArtifactDraft } from "./use-artifact-draft";

/** Sends one "I'm editing" signal for an artifact. Its result is ignored: saves still win without it. */
export type SignalEditing = (publicId: string) => Promise<unknown>;

interface EditingSignalOptions {
  publicId: string;
  draft: ArtifactDraft;
  /** The editor has changes it has not saved. */
  dirty: boolean;
  signal: SignalEditing;
}

/**
 * Tells the server the person is editing, so an agent that names no base
 * version waits instead of overwriting their typing (src/lib/edits). Event
 * driven: it runs when the draft changes (the person typed), never on a
 * timer, and sends at most once every 20 seconds while there are unsaved
 * changes or typing just happened (shouldSignalEditing). The lease ends on
 * its own about a minute after the last signal.
 */
export function useEditingSignal({ publicId, draft, dirty, signal }: EditingSignalOptions) {
  const lastSignalRef = useRef<number | null>(null);
  const firstDraftRef = useRef(draft);
  // Read when the draft changes; a save that only flips `dirty` is not typing.
  const latestRef = useRef({ publicId, dirty, signal });
  useEffect(() => { latestRef.current = { publicId, dirty, signal }; }, [publicId, dirty, signal]);

  useEffect(() => {
    // The draft the editor opened with is not typing.
    if (draft === firstDraftRef.current) return;
    const now = Date.now();
    const { publicId: id, dirty: unsaved, signal: send } = latestRef.current;
    if (!shouldSignalEditing({ now, lastSignalAt: lastSignalRef.current, unsaved, lastInputAt: now })) return;
    lastSignalRef.current = now;
    send(id).catch(() => {
      // Best effort: the person's next save still goes through over agents' saves.
    });
  }, [draft]);
}
