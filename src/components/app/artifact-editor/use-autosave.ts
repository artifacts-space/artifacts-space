import { useCallback, useEffect, useRef, useState } from "react";

import { updateArtifactAction } from "@/app/(workspace)/app/actions";
import type { ArtifactDto, SaveArtifactResult } from "@/lib/artifact-types";
import type { EditSessionStep } from "@/lib/versions/history-rules";

import { AUTOSAVE_DELAY_MS, changedFields, closedSession, draftProblem, hasChanges, keepMineOver, mergeDrafts, sessionStep, type EditSession } from "./autosave-rules";
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
}

/** True when `next` is at least as new as `current`, so a late, older DTO never replaces the base. */
function isNewerOrSame(next: ArtifactDto, current: ArtifactDto) {
  return Date.parse(next.updatedAt) >= Date.parse(current.updatedAt);
}

/**
 * Saves the draft about a second after typing stops. Every save names the
 * version the draft is based on, so it is refused instead of overwriting a
 * newer save by someone else; then the draft merges with theirs when the two
 * changed different fields, or the editor shows a notice to load their
 * version or keep these changes. Saves in one editing session file one
 * version (see autosave-rules.ts and src/lib/versions/history-rules.ts).
 * Switching to another artifact or tab saves what is left; closing or
 * reloading the tab with unsaved changes asks first (useLeaveGuard), since a
 * save sent while the page unloads may not arrive.
 */
export function useAutosave({ artifact, draft, replaceDraft, onUpdated, save = updateArtifactAction }: AutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const [retry, setRetry] = useState(0);
  const baseRef = useRef(artifact);
  const draftRef = useRef(draft);
  const sessionRef = useRef<EditSession>(closedSession);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const callbacksRef = useRef({ replaceDraft, onUpdated, save });

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { callbacksRef.current = { replaceDraft, onUpdated, save }; }, [replaceDraft, onUpdated, save]);
  /** Adopts someone else's newer version as the base, merging the draft when that is trivial. */
  const resolveRefused = useCallback((base: ArtifactDto, theirs: ArtifactDto) => {
    sessionRef.current = closedSession;
    const mine = draftRef.current;
    const outcome = mergeDrafts(draftFrom(base), mine, draftFrom(theirs));
    if (outcome.kind === "conflict") {
      setStatus({ kind: "conflict", theirs, base });
      return;
    }
    baseRef.current = theirs;
    callbacksRef.current.onUpdated(theirs);
    callbacksRef.current.replaceDraft(outcome.draft, outcome.draft.content !== mine.content);
    setStatus({ kind: "saving" });
    setRetry((count) => count + 1);
  }, []);

  useEffect(() => {
    const base = baseRef.current;
    if (artifact.updatedAt === base.updatedAt || !isNewerOrSame(artifact, base)) return;
    // A newer save from outside the autosave (a restore, or this editor's own save landing after a remount)
    // becomes the base; the draft rebases onto it, so the next save never sends the older fields back.
    sessionRef.current = closedSession;
    const mine = draftRef.current;
    const outcome = mergeDrafts(draftFrom(base), mine, draftFrom(artifact));
    if (outcome.kind === "conflict") {
      // Leave the base alone: the next save is refused and offers their version, as for any conflict.
      return;
    }
    baseRef.current = artifact;
    if (hasChanges(mine, outcome.draft)) callbacksRef.current.replaceDraft(outcome.draft, outcome.draft.content !== mine.content);
  }, [artifact]);

  const applyResult = useCallback((result: SaveArtifactResult, base: ArtifactDto) => {
    if (result.success) {
      baseRef.current = result.data;
      sessionRef.current = { open: true, lastSavedAt: Date.now() };
      setStatus({ kind: "saved", waitingForApproval: Boolean(result.data.pendingEdit) });
      callbacksRef.current.onUpdated(result.data);
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
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    const base = baseRef.current;
    const current = draftRef.current;
    const changes = changedFields(draftFrom(base), current);
    if (Object.keys(changes).length === 0) return;
    const problem = draftProblem(current);
    if (problem) {
      setStatus({ kind: "held", message: problem });
      return;
    }
    inFlightRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const session = sessionStep(sessionRef.current, Date.now());
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

  const dirty = hasChanges(draftFrom(artifact), draft);
  const paused = status.kind === "conflict";

  useEffect(() => {
    if (!dirty || paused) return;
    const timer = window.setTimeout(() => { void saveNow(); }, AUTOSAVE_DELAY_MS);
    return () => { window.clearTimeout(timer); };
  }, [draft, dirty, paused, retry, saveNow]);

  useEffect(() => {
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") void saveNow(); };
    const saveOnLeave = () => {
      void saveNow();
      sessionRef.current = closedSession;
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", saveOnLeave);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
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
  }, [status]);

  /** Saves the editor's changes over the newer version. Theirs stays in the history. */
  const keepMine = useCallback(() => {
    if (status.kind !== "conflict") return;
    const mine = draftRef.current;
    const kept = keepMineOver(draftFrom(status.base), mine, draftFrom(status.theirs));
    baseRef.current = status.theirs;
    callbacksRef.current.onUpdated(status.theirs);
    callbacksRef.current.replaceDraft(kept, kept.content !== mine.content);
    setStatus({ kind: "saving" });
    setRetry((count) => count + 1);
  }, [status]);

  const retryNow = useCallback(() => { void saveNow(); }, [saveNow]);

  // A held change undone by hand (the draft is back to the saved version) has nothing left to hold.
  const shown: AutosaveStatus = !dirty && status.kind === "held" ? { kind: "idle" } : status;
  return { status: shown, dirty, loadTheirs, keepMine, retryNow };
}
