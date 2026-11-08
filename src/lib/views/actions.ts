"use server";

import { z } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

import { loadViewStats } from "./view-stats";
import { viewRangeSchema, type ViewStats } from "./view-stats-rules";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");

/**
 * An artifact's views for the Views dialog, for people who may edit it (its
 * author, or a member of the team it is shared through). Everyone else gets
 * the same "Artifact not found." as for an artifact that does not exist.
 */
export async function getViewStatsAction(publicId: string, days: number): Promise<ActionResult<ViewStats>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const range = viewRangeSchema.parse(days);
    const record = await getEditableArtifact(session.user.id, { publicId: publicIdSchema.parse(publicId) });
    if (!record) throw new UserFacingError("Artifact not found.");
    return { success: true, data: await loadViewStats(record, range) };
  } catch (error) {
    if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
      console.error("[views] Stats failed", error instanceof Error ? error.name : "unknown error");
    }
    return { success: false, error: actionErrorMessage(error, "Views could not load. Try again.") };
  }
}
