"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { ArtifactDto } from "@/lib/artifact-types";
import { frameChanges } from "@/lib/canvas/frame-changes";
import { catchUpAction, type NewerArtifact } from "@/lib/edits/catch-up-actions";
import { catchUpWords, shouldCatchUp, takesAnswer, type EditorMoment } from "@/lib/edits/catch-up-rules";

/** Asks whether an artifact moved on from the save the editor shows; null when it did not, or when the answer could not be had. */
export type CatchUpLoader = (artifactId: string, knownUpdatedAt: string) => Promise<NewerArtifact | null>;

const askServer: CatchUpLoader = async (artifactId, knownUpdatedAt) => {
  const result = await catchUpAction(artifactId, knownUpdatedAt);
  return result.success ? result.data : null;
};

/*
 * Which loader the editors on a page use. There is none by default, so a
 * fixture page never asks a server it does not have; a real page wraps its
 * editors in ServerCatchUp, and a fixture that tests this in CatchUpProvider.
 */
const CatchUpContext = createContext<CatchUpLoader | null>(null);

/** Gives the editors inside it a loader: a fixture's stand-in. */
export function CatchUpProvider({ loader, children }: { loader: CatchUpLoader; children: ReactNode }) {
  return <CatchUpContext value={loader}>{children}</CatchUpContext>;
}

/** Turns catching up on for the editors inside it, with the server action. */
export function ServerCatchUp({ children }: { children: ReactNode }) {
  return <CatchUpContext value={askServer}>{children}</CatchUpContext>;
}

/** What the editor shows after it took a newer save: the notice's words, and the canvas frames to mark. */
export interface CaughtUp {
  artifactId: string;
  words: string;
  frames: ReadonlySet<string>;
}

/** The notice and the marks for a newer save, read against what the editor showed before it. */
export function describeCatchUp(shown: Pick<ArtifactDto, "content">, newer: NewerArtifact): CaughtUp {
  const { artifact, changedBy } = newer;
  const frames = artifact.kind === "canvas" ? frameChanges(shown.content, artifact.content) : null;
  return {
    artifactId: artifact.id,
    words: catchUpWords({ kind: artifact.kind, changedBy, frames }),
    frames: new Set(frames?.changed.map((frame) => frame.id)),
  };
}

/** The editor's "caught up" notice: set when a newer save was taken, gone when dismissed or when another artifact opens. */
export function useCaughtUp(artifactId: string) {
  const [state, setState] = useState<CaughtUp | null>(null);
  const dismiss = useCallback(() => { setState(null); }, []);
  return { caughtUp: state?.artifactId === artifactId ? state : null, setCaughtUp: setState, dismiss };
}

/**
 * Catching up for an editor that keeps the notice itself (the /app editor):
 * the notice's words, the frames to mark, and how to dismiss both.
 */
export function useEditorCatchUp({ artifact, stored, unsaved, onUpdated }: Omit<CatchUpOptions, "onCaughtUp"> & { onUpdated: (artifact: ArtifactDto) => void }) {
  const { caughtUp, setCaughtUp, dismiss } = useCaughtUp(artifact.id);
  useCatchUp({ artifact, stored, unsaved, onCaughtUp: (newer, note) => { onUpdated(newer); setCaughtUp(note); } });
  return { words: caughtUp?.words ?? null, frames: caughtUp?.frames, dismiss };
}

function momentOf(held: { artifact: ArtifactDto; known: string; unsaved: boolean }): EditorMoment {
  return { artifactId: held.artifact.id, knownUpdatedAt: held.known, unsaved: held.unsaved };
}

interface CatchUpOptions {
  /** The saved artifact the editor shows. */
  artifact: ArtifactDto;
  /**
   * The newest save of the artifact this tab made, when the editor's copy
   * is older: cover, icon, and theme save through their own actions. Left
   * out, the editor's copy is the newest this tab knows.
   */
  knownUpdatedAt?: string;
  /** False for a blank page that was never saved. */
  stored: boolean;
  /** The editor holds unsaved changes, or a save is on its way. */
  unsaved: boolean;
  /** Takes the newer save: the editor makes it its saved copy, and shows the notice. */
  onCaughtUp: (artifact: ArtifactDto, caughtUp: CaughtUp) => void;
}

/**
 * Catches an open canvas or interface up with a newer save when its tab
 * comes back: on focus, and when the tab becomes visible. Events only, never
 * a timer. Nothing is asked while the editor holds unsaved changes, and an
 * answer that arrives after the person typed, saved, or opened another
 * artifact is dropped; the next return asks again. A check that never
 * answers stops blocking the next one after CATCH_UP_STALE_MS. The rules are
 * in src/lib/edits/catch-up-rules.ts.
 */
export function useCatchUp({ artifact, knownUpdatedAt, stored, unsaved, onCaughtUp }: CatchUpOptions): void {
  const loader = useContext(CatchUpContext);
  const known = knownUpdatedAt ?? artifact.updatedAt;
  const latestRef = useRef({ artifact, known, stored, unsaved, onCaughtUp });
  useEffect(() => { latestRef.current = { artifact, known, stored, unsaved, onCaughtUp }; }, [artifact, known, stored, unsaved, onCaughtUp]);

  useEffect(() => {
    if (!loader) return undefined;
    let alive = true;
    const history = { running: false, lastStartedAt: null as number | null, started: 0 };
    const check = () => {
      const asked = latestRef.current;
      const shown = asked.artifact;
      const now = Date.now();
      if (!shouldCatchUp({ kind: shown.kind, stored: asked.stored, visible: document.visibilityState === "visible", unsaved: asked.unsaved, running: history.running, lastStartedAt: history.lastStartedAt, now })) return;
      history.running = true;
      history.lastStartedAt = now;
      history.started += 1;
      const mine = history.started;
      loader(shown.id, asked.known)
        .then((newer) => {
          const current = latestRef.current;
          if (!alive || !newer) return;
          // The editor moved on while the check ran: the next return asks again.
          if (!takesAnswer(momentOf(asked), momentOf(current), newer.artifact.id)) return;
          current.onCaughtUp(newer.artifact, describeCatchUp(shown, newer));
        })
        .catch(() => undefined)
        // A check that a later one replaced (it never answered in time) does not free the later one's slot.
        .finally(() => { if (history.started === mine) history.running = false; });
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loader]);
}
