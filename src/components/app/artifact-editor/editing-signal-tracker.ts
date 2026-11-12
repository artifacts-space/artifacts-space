import { shouldSignalEditing } from "@/lib/edits/edit-conflict-rules";

/**
 * What the editor remembers between draft changes to decide its "I'm
 * editing" signal (useEditingSignal): when it last sent one, and when the
 * person last typed. Kept apart from React so the rules can be tested.
 */
export interface EditingSignalTracker {
  /** A draft change at `now`; `unsaved` when it leaves changes not yet saved (typing). True when the editor sends "I'm editing" now. */
  onDraftChange: (now: number, unsaved: boolean) => boolean;
  /**
   * The editor leaves the artifact (closes, or moves to another one). Forgets
   * the typing, so it never counts as typing in the next artifact, and the
   * signal. True when it took a lease here, so it sends "I stopped".
   */
  onLeave: () => boolean;
}

/** A tracker for one editor: nothing typed or sent yet. */
export function createEditingSignalTracker(): EditingSignalTracker {
  let lastSignalAt: number | null = null;
  let lastInputAt: number | null = null;
  return {
    onDraftChange(now, unsaved) {
      // A change that leaves unsaved edits is typing; a draft replaced to match the saved artifact is not.
      if (unsaved) lastInputAt = now;
      if (!shouldSignalEditing({ now, lastSignalAt, unsaved, lastInputAt })) return false;
      lastSignalAt = now;
      return true;
    },
    onLeave() {
      lastInputAt = null;
      const tookLease = lastSignalAt !== null;
      lastSignalAt = null;
      return tookLease;
    },
  };
}
