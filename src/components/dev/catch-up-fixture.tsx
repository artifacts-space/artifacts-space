"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { CatchUpProvider, type CatchUpLoader } from "@/components/app/artifact-editor/use-catch-up";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { ChangedBy } from "@/lib/edits/edit-conflict-rules";

import { fixtureArtifact, shortUi } from "./fixture-content";

/*
 * Development only: "did it move on?" answered without a server, for
 * e2e/catch-up.spec.ts. The first check finds that an agent saved the
 * artifact; later checks find nothing newer. Every check is counted on the
 * window.
 */

declare global {
  interface Window {
    /** How many times a fixture's editor asked whether its artifact moved on. */
    fixtureCatchUpChecks?: number;
  }
}

const byAgent: ChangedBy = { handle: "fixture", harness: { id: "claude-code", name: "Claude Code" } };

/** A loader whose first check for an artifact `saveOf` knows returns the agent's save of it. */
function useAgentSave(saveOf: (artifactId: string) => ArtifactDto | null): CatchUpLoader {
  const pending = useRef(true);
  return useCallback((artifactId) => {
    window.fixtureCatchUpChecks = (window.fixtureCatchUpChecks ?? 0) + 1;
    const saved = pending.current ? saveOf(artifactId) : null;
    if (!saved) return Promise.resolve(null);
    pending.current = false;
    return Promise.resolve({ artifact: { ...saved, updatedAt: new Date().toISOString() }, changedBy: byAgent });
  }, [saveOf]);
}

/** What the fixture's "agent" does to a canvas: renames the second frame and removes the third. */
function canvasAfterAgent(content: string): string {
  const canvas = JSON.parse(content) as { frames: { id: string; name: string }[] };
  const frames = canvas.frames.filter((frame) => frame.id !== "ticket").map((frame) => (frame.id === "inbox" ? { ...frame, name: "2. Inbox, triaged" } : frame));
  return JSON.stringify({ ...canvas, frames }, null, 2);
}

/** The artifact page's fixture: with `on`, an agent's save of this canvas waits for the editor's first check. */
export function CanvasAgentSave({ artifact, on, children }: { artifact: ArtifactDto; on: boolean; children: ReactNode }) {
  const saveOf = useCallback((artifactId: string) => (artifactId === artifact.id && artifact.kind === "canvas" ? { ...artifact, content: canvasAfterAgent(artifact.content) } : null), [artifact]);
  const loader = useAgentSave(saveOf);
  return on ? <CatchUpProvider loader={loader}>{children}</CatchUpProvider> : children;
}

/** The interface the workspace fixture's "agent" saves over the Long ui fixture: a short launch plan. */
function workspaceAgentSave(artifactId: string): ArtifactDto | null {
  if (artifactId !== "fixture-ui") return null;
  return fixtureArtifact({ id: "fixture-ui", kind: "ui", title: "Long ui fixture", content: shortUi(), publicId: "fixtureworkspace0000ui" });
}

/** The /app fixture: an agent's save of the Long ui fixture waits for its editor's first check. */
export function WorkspaceAgentSave({ children }: { children: ReactNode }) {
  const loader = useAgentSave(workspaceAgentSave);
  return <CatchUpProvider loader={loader}>{children}</CatchUpProvider>;
}
