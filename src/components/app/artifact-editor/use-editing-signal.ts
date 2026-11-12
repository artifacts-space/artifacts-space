import { useEffect, useRef, useState } from "react";

import { createEditingSignalTracker } from "./editing-signal-tracker";

import type { ArtifactDraft } from "./use-artifact-draft";

/** Sends one "I'm editing" signal for an artifact, or with `editing` false, "I stopped". Its result is ignored: saves still win without it. */
export type SignalEditing = (artifactId: string, editing?: boolean) => Promise<unknown>;

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
 * changes or typing just happened (shouldSignalEditing). When the editor
 * closes (or moves to another artifact) after it took a lease, it ends that
 * lease within 20 seconds; not at once, because the lease is per person,
 * and another tab of theirs still typing keeps it with its next signal.
 * Otherwise the lease ends on its own about a minute after
 * the last signal: a save that leaves nothing unsaved keeps it, because the
 * person usually goes on typing, and ending it on every autosave would turn
 * the 20-second throttle into a request per save. A closed tab cannot send
 * anything reliably, so its lease runs out the same way.
 */
export function useEditingSignal({ artifactId, draft, dirty, signal }: EditingSignalOptions) {
  // When it last signalled and when the person last typed (editing-signal-tracker.ts); one per editor.
  const [tracker] = useState(createEditingSignalTracker);
  // Read when the draft changes; a save that only flips `dirty` is not typing.
  const latestRef = useRef({ artifactId, dirty, signal });
  useEffect(() => { latestRef.current = { artifactId, dirty, signal }; }, [artifactId, dirty, signal]);

  useEffect(() => {
    return () => {
      // Typing in the artifact being left never counts as typing in the next one: opening an artifact takes no lease.
      if (!tracker.onLeave()) return;
      latestRef.current.signal(artifactId, false).catch(() => {
        // Best effort: the lease runs out on its own.
      });
    };
  }, [artifactId, tracker]);

  useEffect(() => {
    const { artifactId: id, dirty: unsaved, signal: send } = latestRef.current;
    // A change that leaves unsaved edits is typing. A draft replaced to match the saved artifact (the editable
    // copy loading, a restore, loading their version) is not, so opening an artifact never takes a lease.
    if (!tracker.onDraftChange(Date.now(), unsaved)) return;
    send(id).catch(() => {
      // Best effort: the person's next save still goes through over agents' saves.
    });
  }, [draft, tracker]);
}
