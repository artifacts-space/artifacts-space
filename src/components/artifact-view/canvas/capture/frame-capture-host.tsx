"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptureApi } from "./capture-api";
import { CaptureBox, type BoxElements, type BoxJob } from "./capture-box";
import { mayDraw, ownSaveWaits, startsPass, type DrawingConditions, type PassHistory, type PassReason } from "./capture-host-rules";
import type { PassEnv } from "./capture-pass";

/*
 * The capture host: draws images of a canvas's frames in the tab of someone
 * who may edit it, so agents can see what the frames look like
 * (src/lib/canvas/captures.ts). One per page, mounted by a component that
 * holds the artifact and the edit access; it shows nothing. It asks the
 * server which drawings are needed when the canvas opens, when the tab comes
 * back, and when its window loses focus after the tab's own save; it never
 * polls. Each drawing is made in a hidden, inert box (capture-box.tsx).
 */

interface FrameCaptureHostProps {
  /** The saved canvas's id, or null while there is none (a blank page, an artifact still loading). */
  artifactId: string | null;
  /** The artifact's saved format. Only a canvas is drawn. */
  kind: string;
  /** When this tab last saved the artifact (its `updatedAt`), or null. A change means the tab's own save landed. */
  savedAt: string | null;
  /** The server actions, a fixture's stand-in, or null where frame images are not drawn. */
  api: CaptureApi | null;
}

function conditionsNow(): DrawingConditions {
  const connection: unknown = "connection" in navigator ? navigator.connection : null;
  const saveData = typeof connection === "object" && connection !== null && "saveData" in connection && connection.saveData === true;
  return { saveData, windowWidth: window.innerWidth, visible: document.visibilityState === "visible" };
}

/** Resolves when the browser is idle; after a short wait where it cannot say. */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => { resolve(); }, { timeout: 2_000 });
    else window.setTimeout(() => { resolve(); }, 200);
  });
}

/** The box the host shows, and the pass's wait for it to be drawn. */
function useCaptureBox() {
  const [job, setJob] = useState<BoxJob | null>(null);
  const waiting = useRef<{ key: string; step: number; resolve: (elements: BoxElements | null) => void } | null>(null);

  const release = useCallback((elements: BoxElements | null) => {
    const waiter = waiting.current;
    waiting.current = null;
    waiter?.resolve(elements);
  }, []);

  const show = useCallback((next: BoxJob) => {
    release(null);
    return new Promise<BoxElements | null>((resolve) => {
      waiting.current = { key: next.key, step: next.step, resolve };
      setJob(next);
    });
  }, [release]);

  const hide = useCallback(() => {
    release(null);
    setJob(null);
  }, [release]);

  /** The box drew the step the pass waits for. */
  const shown = useCallback((key: string, step: number, elements: BoxElements | null) => {
    if (waiting.current?.key === key && waiting.current.step === step) release(elements);
  }, [release]);

  return { job, show, hide, shown, release };
}

/** How many passes ended, and whether one runs now: the marks a test waits for. */
interface HostMarks {
  drawing: boolean;
  passes: number;
}

/**
 * Starts passes on the host's signals and keeps one running at a time. The
 * pass's code loads on the first pass.
 */
function useCapturePasses({ active, artifactId, savedAt, api, box }: { active: boolean; artifactId: string | null; savedAt: string | null; api: CaptureApi | null; box: ReturnType<typeof useCaptureBox> }) {
  const [marks, setMarks] = useState<HostMarks>({ drawing: false, passes: 0 });
  const history = useRef<PassHistory>({ running: false, lastStartedAt: null });
  const alive = useRef(false);
  const saved = useRef(savedAt);
  const seenSave = useRef(savedAt);
  const { show, hide, release } = box;

  const request = useCallback((reason: PassReason) => {
    if (!api || artifactId === null || !alive.current || !mayDraw(conditionsNow())) return;
    const now = Date.now();
    if (!startsPass(reason, history.current, now)) return;
    history.current = { running: true, lastStartedAt: now };
    seenSave.current = saved.current;
    setMarks((current) => ({ ...current, drawing: true }));
    const env: PassEnv = { api, artifactId, show, hide, idle: whenIdle, mayContinue: () => alive.current && mayDraw(conditionsNow()) };
    void import("./capture-pass")
      .then(({ runPass }) => runPass(env))
      .catch(() => undefined)
      .finally(() => {
        history.current = { ...history.current, running: false };
        if (alive.current) setMarks((current) => ({ drawing: false, passes: current.passes + 1 }));
      });
  }, [api, artifactId, show, hide]);

  // The canvas opened (or became one this page may draw).
  useEffect(() => {
    if (!active) return;
    alive.current = true;
    request("open");
    return () => {
      alive.current = false;
      release(null);
    };
  }, [active, request, release]);

  // The tab came back, or its window lost focus after its own save.
  useEffect(() => {
    if (!active) return;
    const onFocus = () => { request("return"); };
    const onVisible = () => { if (document.visibilityState === "visible") request("return"); };
    const onBlur = () => { if (ownSaveWaits(saved.current, seenSave.current)) request("after-save"); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, request]);

  // The tab's own save landed while its window was already out of focus. A save in a focused window starts nothing.
  useEffect(() => {
    saved.current = savedAt;
    if (active && !document.hasFocus() && ownSaveWaits(savedAt, seenSave.current)) request("after-save");
  }, [active, savedAt, request]);

  return marks;
}

/**
 * Draws a canvas's frame images for agents, from this tab. Render it once
 * per page, beside the editor, never inside the artifact's content; it
 * renders nothing but a hidden, inert container, and nothing at all where
 * `api` is null, the artifact is not a saved canvas, or the viewer's device
 * asks to save data. Its marks, `data-frame-captures` ("idle" or "drawing")
 * and `data-frame-capture-passes`, are what a test waits for.
 */
export function FrameCaptureHost({ artifactId, kind, savedAt, api }: FrameCaptureHostProps) {
  const active = api !== null && artifactId !== null && kind === "canvas";
  const box = useCaptureBox();
  const marks = useCapturePasses({ active, artifactId, savedAt, api, box });
  const { job, shown } = box;
  const key = job?.key ?? "";
  const onShown = useCallback((step: number, elements: BoxElements | null) => { shown(key, step, elements); }, [shown, key]);
  if (!active) return null;
  return (
    <div
      inert
      data-comment-skip=""
      data-frame-captures={marks.drawing ? "drawing" : "idle"}
      data-frame-capture-passes={marks.passes}
      className="pointer-events-none fixed top-0 left-0 size-0 overflow-hidden"
    >
      {job ? <CaptureBox key={job.key} job={job} onShown={onShown} /> : null}
    </div>
  );
}
