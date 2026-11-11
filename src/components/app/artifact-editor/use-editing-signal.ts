import { useEffect, useRef } from "react";

import { shouldSignalEditing } from "@/lib/edits/edit-conflict-rules";

import type { ArtifactDraft } from "./use-artifact-draft";

/** Sends one "I'm editing" signal for an artifact. Its result is ignored: saves still win without it. */
export type SignalEditing = (artifactId: string) => Promise<unknown>;

interface EditingSignalOptions {
  artifactId: string;
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
export function useEditingSignal({ artifactId, draft, dirty, signal }: EditingSignalOptions) {
  const lastSignalRef = useRef<number | null>(null);
  const lastInputRef = useRef<number | null>(null);
  // Read when the draft changes; a save that only flips `dirty` is not typing.
  const latestRef = useRef({ artifactId, dirty, signal });
  useEffect(() => { latestRef.current = { artifactId, dirty, signal }; }, [artifactId, dirty, signal]);

  useEffect(() => {
    const now = Date.now();
    const { artifactId: id, dirty: unsaved, signal: send } = latestRef.current;
    // A change that leaves unsaved edits is typing. A draft replaced to match the saved artifact (the editable
    // copy loading, a restore, loading their version) is not, so opening an artifact never takes a lease.
    if (unsaved) lastInputRef.current = now;
    if (!shouldSignalEditing({ now, lastSignalAt: lastSignalRef.current, unsaved, lastInputAt: lastInputRef.current })) return;
    lastSignalRef.current = now;
    send(id).catch(() => {
      // Best effort: the person's next save still goes through over agents' saves.
    });
  }, [draft]);
}
