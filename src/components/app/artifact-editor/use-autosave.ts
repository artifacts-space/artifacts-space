import { useCallback, useEffect, useRef, useState } from "react";

import { updateArtifactAction } from "@/app/(workspace)/app/actions";
import type { ArtifactDto, SaveArtifactResult } from "@/lib/artifact-types";
import { signalEditingAction } from "@/lib/edits/actions";
import type { EditSessionStep } from "@/lib/versions/history-rules";

import { changedFields, closedSession, draftProblem, hasChanges, keepMineOver, mergeDrafts, nextSaveDelay, replacesContentUnderEdits, sessionStep, type EditSession } from "./autosave-rules";
import { useEditingSignal, type SignalEditing } from "./use-editing-signal";
import { draftFrom, type ArtifactDraft } from "./use-artifact-draft";

/** What the editor shows about saving, beside the character count. */
export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; waitingForApproval: boolean }
  | { kind: "held"; message: string }
  | { kind: "failed"; message: string }
  /** `base`: the version both drafts started from, so keeping mine keeps their other changes. */
  | { kind: "conflict"; theirs: ArtifactDto; base: ArtifactDto };

const offlineMessage = "Not saved. Check your connection.";

/** Sends one save. The default is the web save action; the dev fixtures pass a stand-in that needs no database. */
export type SaveArtifact = (
  id: string,
  changes: Partial<ArtifactDraft>,
  options: { expectedUpdatedAt: string; session: EditSessionStep },
) => Promise<SaveArtifactResult>;

interface AutosaveOptions {
  artifact: ArtifactDto;
  draft: ArtifactDraft;
  /** Replaces the draft; `remount` reloads the content editor. */
  replaceDraft: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
  save?: SaveArtifact | undefined;
  /** Why the draft cannot be saved yet; defaults to draftProblem against the saved version. */
  problem?: ((draft: ArtifactDraft, base: ArtifactDraft) => string | null) | undefined;
  /** True while there is nothing worth saving (a blank new page): no save, no status, nothing to guard on leaving. */
  idle?: ((draft: ArtifactDraft) => boolean) | undefined;
  /** Sends "I'm editing" (src/lib/edits); the default is the web action, the dev fixtures pass a stand-in. */
  signalEditing?: SignalEditing | undefined;
}

const neverIdle = () => false;

/** True when `next` is at least as new as `current`, so a late, older DTO never replaces the base. */
function isNewerOrSame(next: ArtifactDto, current: ArtifactDto) {
  return Date.parse(next.updatedAt) >= Date.parse(current.updatedAt);
}

/**
 * Saves the draft about a second after typing stops, at least every 5
 * seconds while typing goes on, and never more than once every 5 seconds
 * (nextSaveDelay); leaving a field, the tab, or the artifact saves at once.
 * Every save names the
 * version the draft is based on, so it is refused instead of overwriting a
 * newer save by someone else; then the draft merges with theirs when the two
 * changed different fields, or the editor shows a notice to load their
 * version or keep these changes. A save over agents' newer saves goes
 * through (the person's work wins) and `agentSaved` says so; incoming content
 * never replaces what the person is typing. While the person types, the
 * editor tells the server it is editing (useEditingSignal), so agents that
 * name no base version wait. Saves in one editing session file one
 * version (see autosave-rules.ts and src/lib/versions/history-rules.ts).
 * Switching to another artifact or tab saves what is left; closing or
 * reloading the tab with unsaved changes asks first (useLeaveGuard), since a
 * save sent while the page unloads may not arrive.
 */
export function useAutosave({ artifact, draft, replaceDraft, onUpdated, save = updateArtifactAction, problem: problemOf = draftProblem, idle = neverIdle, signalEditing = signalEditingAction }: AutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  /** An agent saved while this editor had changes; this editor's save went through and theirs is in History. */
  const [agentSaved, setAgentSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const baseRef = useRef(artifact);
  const draftRef = useRef(draft);
  const sessionRef = useRef<EditSession>(closedSession);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  /** When the oldest unsaved change was made, and when the last save was sent (ms since the epoch). */
  const pendingSinceRef = useRef<number | null>(null);
  const lastSaveAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  /** The next save resends a merged or kept draft (see SaveTiming.resend). */
  const resendRef = useRef(false);
  const callbacksRef = useRef({ replaceDraft, onUpdated, save, problemOf, idle });

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { callbacksRef.current = { replaceDraft, onUpdated, save, problemOf, idle }; }, [replaceDraft, onUpdated, save, problemOf, idle]);
  /** Adopts someone else's newer version as the base, merging the draft when that is trivial. */
  /** Makes `theirs` the base with `next` as the draft, and sends `next` again when it still differs from theirs. */
  const adopt = useCallback((theirs: ArtifactDto, next: ArtifactDraft, mine: ArtifactDraft) => {
    baseRef.current = theirs;
    callbacksRef.current.onUpdated(theirs);
    callbacksRef.current.replaceDraft(next, next.content !== mine.content);
    if (!hasChanges(draftFrom(theirs), next)) {
      setStatus({ kind: "saved", waitingForApproval: Boolean(theirs.pendingEdit) });
      return;
    }
    resendRef.current = true;
    setStatus({ kind: "saving" });
    setRetry((count) => count + 1);
  }, []);

  const resolveRefused = useCallback((base: ArtifactDto, theirs: ArtifactDto) => {
    sessionRef.current = closedSession;
    const mine = draftRef.current;
    const outcome = mergeDrafts(draftFrom(base), mine, draftFrom(theirs));
    // Their content never replaces the editor's while the person has unsaved changes: they choose in the notice.
    if (outcome.kind === "conflict" || replacesContentUnderEdits(draftFrom(base), mine, outcome.draft)) {
      setStatus({ kind: "conflict", theirs, base });
      return;
    }
    adopt(theirs, outcome.draft, mine);
  }, [adopt]);

  useEffect(() => {
    const base = baseRef.current;
    if (artifact.updatedAt === base.updatedAt || !isNewerOrSame(artifact, base)) return;
    // A newer save from outside the autosave (a restore, or this editor's own save landing after a remount)
    // becomes the base; the draft rebases onto it, so the next save never sends the older fields back.
    sessionRef.current = closedSession;
    const mine = draftRef.current;
    const outcome = mergeDrafts(draftFrom(base), mine, draftFrom(artifact));
    // Leave the base alone on a conflict, and whenever their content would replace what the person is typing:
    // the next save goes through over an agent's save, or is refused and offers their version.
    if (outcome.kind === "conflict" || replacesContentUnderEdits(draftFrom(base), mine, outcome.draft)) return;
    baseRef.current = artifact;
    if (hasChanges(mine, outcome.draft)) callbacksRef.current.replaceDraft(outcome.draft, outcome.draft.content !== mine.content);
  }, [artifact]);

  const applyResult = useCallback((result: SaveArtifactResult, base: ArtifactDto) => {
    if (result.success) {
      baseRef.current = result.data;
      sessionRef.current = { open: true, lastSavedAt: Date.now() };
      setStatus({ kind: "saved", waitingForApproval: Boolean(result.data.pendingEdit) });
      callbacksRef.current.onUpdated(result.data);
      if (result.savedOverAgents === true) {
        // The person's version wins. Fields this save did not send may hold an agent's change; the editor still
        // shows the person's, so what differs from the saved row is sent next, into the same version.
        setAgentSaved(true);
        if (hasChanges(draftFrom(result.data), draftRef.current)) {
          resendRef.current = true;
          setRetry((count) => count + 1);
        }
      }
      return;
    }
    if (result.latest) {
      resolveRefused(base, result.latest);
      return;
    }
    setStatus({ kind: "failed", message: `Not saved. ${result.error}` });
  }, [resolveRefused]);

  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const saveNow = useCallback(async () => {
    // While a conflict notice waits for a choice, nothing saves: the save would be refused again.
    if (pausedRef.current) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    const base = baseRef.current;
    const current = draftRef.current;
    if (callbacksRef.current.idle(current)) return;
    const changes = changedFields(draftFrom(base), current);
    if (Object.keys(changes).length === 0) return;
    const problem = callbacksRef.current.problemOf(current, draftFrom(base));
    if (problem) {
      setStatus({ kind: "held", message: problem });
      return;
    }
    inFlightRef.current = true;
    const sentAt = Date.now();
    resendRef.current = false;
    pendingSinceRef.current = null;
    lastSaveAtRef.current = sentAt;
    setStatus({ kind: "saving" });
    try {
      const session = sessionStep(sessionRef.current, sentAt);
      applyResult(await callbacksRef.current.save(base.id, changes, { expectedUpdatedAt: base.updatedAt, session }), base);
    } catch {
      setStatus({ kind: "failed", message: offlineMessage });
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        // Called directly, not through a re-render: after leaving the artifact the editor is unmounted, and the queued change must still go.
        void saveNowRef.current();
      }
    }
  }, [applyResult]);
  useEffect(() => { saveNowRef.current = saveNow; }, [saveNow]);

  const dirty = hasChanges(draftFrom(artifact), draft) && !idle(draft);
  const paused = status.kind === "conflict";
  useEditingSignal({ publicId: artifact.publicId, draft, dirty, signal: signalEditing });
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (!dirty) {
      pendingSinceRef.current = null;
      return;
    }
    if (paused) return;
    // Runs on every change: the change was made now.
    const now = Date.now();
    pendingSinceRef.current ??= now;
    const delay = nextSaveDelay({ now, pendingSince: pendingSinceRef.current, lastSaveAt: lastSaveAtRef.current, resend: resendRef.current });
    const timer = window.setTimeout(() => { void saveNow(); }, delay);
    return () => { window.clearTimeout(timer); };
  }, [draft, dirty, paused, retry, saveNow]);

  useEffect(() => {
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") void saveNow(); };
    // Leaving a field or the window saves at once; saveNow sends nothing when nothing changed.
    const saveOnBlur = () => { void saveNow(); };
    const saveOnLeave = () => {
      void saveNow();
      sessionRef.current = closedSession;
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    document.addEventListener("focusout", saveOnBlur);
    window.addEventListener("blur", saveOnBlur);
    window.addEventListener("pagehide", saveOnLeave);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      document.removeEventListener("focusout", saveOnBlur);
      window.removeEventListener("blur", saveOnBlur);
      window.removeEventListener("pagehide", saveOnLeave);
      // Switching to another artifact unmounts the editor: save what is left.
      void saveNow();
    };
  }, [saveNow]);

  /** Drops the editor's unsaved changes and loads the newer version. */
  const loadTheirs = useCallback(() => {
    if (status.kind !== "conflict") return;
    baseRef.current = status.theirs;
    callbacksRef.current.onUpdated(status.theirs);
    callbacksRef.current.replaceDraft(draftFrom(status.theirs), true);
    setStatus({ kind: "idle" });
    setAgentSaved(false);
  }, [status]);

  /** Saves the editor's changes over the newer version. Theirs stays in the history. */
  const keepMine = useCallback(() => {
    if (status.kind !== "conflict") return;
    const mine = draftRef.current;
    adopt(status.theirs, keepMineOver(draftFrom(status.base), mine, draftFrom(status.theirs)), mine);
  }, [status, adopt]);

  const retryNow = useCallback(() => { void saveNow(); }, [saveNow]);
  const dismissAgentSaved = useCallback(() => { setAgentSaved(false); }, []);

  // A held change undone by hand (the draft is back to the saved version) has nothing left to hold.
  const shown: AutosaveStatus = !dirty && status.kind === "held" ? { kind: "idle" } : status;
  return { status: shown, dirty, loadTheirs, keepMine, retryNow, agentSaved, dismissAgentSaved };
}
