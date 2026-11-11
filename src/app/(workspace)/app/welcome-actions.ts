"use server";

import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";
import { dismissTeamWelcome } from "@/lib/teams/welcome";

const teamIdSchema = z.string({ error: "Unknown team." }).trim().min(1, { error: "Unknown team." }).max(200, { error: "Unknown team." });

/** Closes the welcome card in one team's workspace for the signed-in member, on every device. */
export async function dismissTeamWelcomeAction(teamId: unknown): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Sign in again to save this." };
    if (!(await dismissTeamWelcome(session.user.id, teamIdSchema.parse(teamId)))) return { success: false, error: "You are not in this team." };
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Could not close the welcome. Try again.") };
  }
}
