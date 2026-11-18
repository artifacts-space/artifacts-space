"use client";

import { useState } from "react";

import { LeaveActionsProvider, type LeaveActions } from "@/components/teams/leave-actions";
import { departureLimits, movableIds, type DepartingArtifact, type LeavePreview, type MoveOutcome } from "@/lib/teams/departure-rules";
import type { TeamMemberView } from "@/lib/teams/queries";

import { fixtureHeir } from "./team-fixture";

/**
 * Development only: Leave team for the /dev/team fixture, kept in memory.
 * The new owner comes from the real rule (heirAfterLeaving) over the
 * fixture's members, and a move checks the ids with the server's own rule
 * (movableIds). `move` makes the first artifact's move wait for approval or
 * be refused, so the dialog's words for both can be seen. Leaving itself is
 * refused here, so the fixture never navigates away.
 */

export type FixtureMoveMode = "apply" | "wait" | "refuse";

const fixtureTitles = ["Launch plan", "Q3 roadmap", "Hiring loop", "Incident notes", "Design review", "Pricing draft", "Onboarding checklist"];

/** `count` of the viewer's artifacts in the fixture team, newest first. */
export function fixtureLeavingArtifacts(count: number): DepartingArtifact[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-leaving-${String(index + 1)}`,
    publicId: `fixtureleaving${String(index + 1).padStart(8, "0")}`,
    title: fixtureTitles[index % fixtureTitles.length] ?? "Untitled",
  }));
}

function createStore(input: { members: readonly TeamMemberView[]; viewerId: string; count: number; mode: FixtureMoveMode }): LeaveActions {
  let artifacts = fixtureLeavingArtifacts(input.count);
  const heir = fixtureHeir(input.members, input.viewerId);
  const preview = (): LeavePreview => ({ total: artifacts.length, artifacts: artifacts.slice(0, departureLimits.listed), heir });
  const firstId = artifacts[0]?.id;
  return {
    preview: () => Promise.resolve({ success: true, data: preview() }),
    moveToPersonal: (_teamId, ids) => {
      const { allowed } = movableIds(ids, artifacts);
      const outcome: MoveOutcome = { moved: [], waiting: [], refused: [] };
      for (const item of allowed) {
        if (item.id === firstId && input.mode === "wait") outcome.waiting.push(item);
        else if (item.id === firstId && input.mode === "refuse") outcome.refused.push({ artifact: item, reason: "Artifact not found. Only its author, or the person who added the agent that wrote it, can share it." });
        else outcome.moved.push(item);
      }
      const moved = new Set(outcome.moved.map((item) => item.id));
      artifacts = artifacts.filter((item) => !moved.has(item.id));
      return Promise.resolve({ success: true, data: { outcome, preview: preview() } });
    },
    leave: () => Promise.resolve({ success: false, error: "This fixture stays in the team." }),
  };
}

/** Wraps the fixture team page so its Leave team button reads and moves from memory. */
export function FixtureLeaveProvider({ members, viewerId, count, mode, children }: { members: TeamMemberView[]; viewerId: string; count: number; mode: FixtureMoveMode; children: React.ReactNode }) {
  const [actions] = useState(() => createStore({ members, viewerId, count, mode }));
  return <LeaveActionsProvider actions={actions}>{children}</LeaveActionsProvider>;
}
