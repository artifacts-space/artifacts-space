"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { CatchUpProvider, type CatchUpLoader } from "@/components/app/artifact-editor/use-catch-up";
import { useNoteOwnSave } from "@/components/artifact-page/page-editor-chrome";
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

/** Which stand-in the artifact page's fixture uses: an agent's save, or a server that holds this tab's own cover save. */
export type FixtureCatchUp = "agent" | "own-save" | null;

/** When the fixture's "cover save" happened: after the copy the editor holds. */
const coverSavedAt = "2026-11-07T12:20:00.000Z";

/**
 * A server whose newest save of the artifact is this tab's own cover save:
 * the content is the same, only the time moved on. A check from that time
 * finds nothing newer; a check from any other time gets the row back, as
 * the real action would answer.
 */
function useServerWithCoverSave(artifact: ArtifactDto): CatchUpLoader {
  return useCallback((artifactId, knownUpdatedAt) => {
    window.fixtureCatchUpChecks = (window.fixtureCatchUpChecks ?? 0) + 1;
    if (artifactId !== artifact.id || knownUpdatedAt === coverSavedAt) return Promise.resolve(null);
    return Promise.resolve({ artifact: { ...artifact, updatedAt: coverSavedAt }, changedBy: { handle: "fixture", harness: null } });
  }, [artifact]);
}

/** Stands in for the cover picker: tells the page that this tab saved the cover, as the real action does. */
function SaveCoverButton({ artifact }: { artifact: ArtifactDto }) {
  const noteOwnSave = useNoteOwnSave();
  return <button type="button" className="mb-4 rounded-md border px-3 py-1 text-sm" onClick={() => { noteOwnSave({ savedFrom: artifact.updatedAt, savedAt: coverSavedAt }); }}>Save a cover (fixture)</button>;
}

function OwnCoverSave({ artifact, children }: { artifact: ArtifactDto; children: ReactNode }) {
  const loader = useServerWithCoverSave(artifact);
  return <CatchUpProvider loader={loader}><SaveCoverButton artifact={artifact} />{children}</CatchUpProvider>;
}

function AgentSave({ artifact, children }: { artifact: ArtifactDto; children: ReactNode }) {
  const saveOf = useCallback((artifactId: string) => (artifactId === artifact.id && artifact.kind === "canvas" ? { ...artifact, content: canvasAfterAgent(artifact.content) } : null), [artifact]);
  const loader = useAgentSave(saveOf);
  return <CatchUpProvider loader={loader}>{children}</CatchUpProvider>;
}

/**
 * The artifact page's fixture. `agent`: an agent's save of this canvas
 * waits for the editor's first check. `own-save`: the server holds this
 * tab's own cover save, and a button makes that save. null: no loader, as
 * on a page that never turned catching up on.
 */
export function CanvasCatchUp({ artifact, mode, children }: { artifact: ArtifactDto; mode: FixtureCatchUp; children: ReactNode }) {
  if (mode === "agent") return <AgentSave artifact={artifact}>{children}</AgentSave>;
  if (mode === "own-save") return <OwnCoverSave artifact={artifact}>{children}</OwnCoverSave>;
  return children;
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
