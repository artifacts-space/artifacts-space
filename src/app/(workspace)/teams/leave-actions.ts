"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { leavePreviewFor, moveOwnTeamArtifactsToPersonal } from "@/lib/teams/departure";
import { departureLimits, type LeavePreview, type MoveResult } from "@/lib/teams/departure-rules";
import type { TeamMembership } from "@/lib/teams/queries";

import { guardTeam, idSchema } from "./team-guard";

/**
 * Before someone leaves a team: what stays behind, and moving their own
 * artifacts to Personal first (decided by the owner on 18 Nov 2026, #219).
 * The same guard as leaving (team-guard.ts and leaveTeamAction): a signed-in
 * member of a shared team. Only the viewer's own artifacts are listed or
 * moved; ids from the browser are checked against the database
 * (moveOwnTeamArtifactsToPersonal).
 */

const leavable = (membership: TeamMembership) => !membership.personal && membership.kind === "person";
const denied = "You cannot leave your personal team.";

const moveSchema = z
  .array(idSchema)
  .min(1, "Choose an artifact to move.")
  .max(departureLimits.movePerRequest, `Move at most ${String(departureLimits.movePerRequest)} at a time.`);

/** The viewer's artifacts whose home is this team, and who takes them over when the viewer leaves. */
export async function leavePreviewAction(teamId: string): Promise<ActionResult<LeavePreview>> {
  try {
    const checked = await guardTeam(teamId, leavable, denied);
    if (!checked.ok) return checked.result;
    return { success: true, data: await leavePreviewFor(checked.membership.id, checked.membership.userId) };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "We could not check your artifacts in this team. Please try again.") };
  }
}

/**
 * Moves the viewer's chosen artifacts from this team to their Personal
 * workspace, through the sharing service's private path, and answers with
 * what moved and the preview read again.
 */
export async function moveToPersonalBeforeLeavingAction(teamId: string, artifactIds: readonly string[]): Promise<ActionResult<MoveResult>> {
  try {
    const checked = await guardTeam(teamId, leavable, denied);
    if (!checked.ok) return checked.result;
    const ids = moveSchema.parse(artifactIds);
    const result = await moveOwnTeamArtifactsToPersonal({ teamId: checked.membership.id, userId: checked.membership.userId, ids });
    revalidatePath("/app");
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Your artifacts could not be moved. Please try again.") };
  }
}
