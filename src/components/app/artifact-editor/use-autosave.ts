import { useCallback, useEffect, useRef, useState } from "react";

import { updateArtifactAction } from "@/app/(workspace)/app/actions";
import type { ArtifactDto, SaveArtifactResult } from "@/lib/artifact-types";

import { AUTOSAVE_DELAY_MS, changedFields, closedSession, draftProblem, hasChanges, mergeDrafts, sessionStep, type EditSession } from "./autosave-rules";
import { draftFrom, type ArtifactDraft } from "./use-artifact-draft";

/** What the editor shows about saving, beside the character count. */
export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; waitingForApproval: boolean }
  | { kind: "held"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "conflict"; theirs: ArtifactDto };

const offlineMessage = "Not saved. Check your connection.";

interface AutosaveOptions {
  artifact: ArtifactDto;
  draft: ArtifactDraft;
  /** Replaces the draft; `remount` reloads the content editor. */
  replaceDraft: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
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
 * Leaving the artifact or the page saves what is left and closes the session.
 */
export function useAutosave({ artifact, draft, replaceDraft, onUpdated }: AutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const [retry, setRetry] = useState(0);
  const baseRef = useRef(artifact);
  const draftRef = useRef(draft);
  const sessionRef = useRef<EditSession>(closedSession);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const callbacksRef = useRef({ replaceDraft, onUpdated });

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { callbacksRef.current = { replaceDraft, onUpdated }; }, [replaceDraft, onUpdated]);
  useEffect(() => {
    const base = baseRef.current;
    if (artifact.updatedAt === base.updatedAt || !isNewerOrSame(artifact, base)) return;
    // A newer save from outside the autosave, such as a restore, starts a new version.
    baseRef.current = artifact;
    sessionRef.current = closedSession;
  }, [artifact]);

  /** Adopts someone else's newer version as the base, merging the draft when that is trivial. */
  const resolveRefused = useCallback((base: ArtifactDto, theirs: ArtifactDto) => {
    sessionRef.current = closedSession;
    const mine = draftRef.current;
    const outcome = mergeDrafts(draftFrom(base), mine, draftFrom(theirs));
    if (outcome.kind === "conflict") {
      setStatus({ kind: "conflict", theirs });
      return;
    }
    baseRef.current = theirs;
    callbacksRef.current.onUpdated(theirs);
    callbacksRef.current.replaceDraft(outcome.draft, outcome.draft.content !== mine.content);
    setStatus({ kind: "saving" });
    setRetry((count) => count + 1);
  }, []);

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
      applyResult(await updateArtifactAction(base.id, changes, { expectedUpdatedAt: base.updatedAt, session }), base);
    } catch {
      setStatus({ kind: "failed", message: offlineMessage });
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        setRetry((count) => count + 1);
      }
    }
  }, [applyResult]);

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
    baseRef.current = status.theirs;
    callbacksRef.current.onUpdated(status.theirs);
    setStatus({ kind: "saving" });
    setRetry((count) => count + 1);
  }, [status]);

  const retryNow = useCallback(() => { void saveNow(); }, [saveNow]);

  return { status, dirty, loadTheirs, keepMine, retryNow };
}
