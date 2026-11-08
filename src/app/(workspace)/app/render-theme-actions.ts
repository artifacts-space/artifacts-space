"use server";

import { z } from "zod";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getViewableArtifact } from "@/lib/access";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";
import { resolveThemeFor } from "@/lib/themes/artifact-theme-context";
import type { Theme } from "@/lib/themes/schema";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");

/**
 * The validated theme an artifact renders with for this viewer, exactly as
 * its page resolves it: its own theme, then the default of the team it is
 * shared through, then the site default. The /app preview asks for it when
 * the theme depends on the team (resolvesWithoutTeam is false). Only
 * readers of the artifact get an answer; it carries colors and fonts only,
 * never a preset's name.
 */
export async function artifactRenderThemeAction(publicId: string): Promise<ActionResult<Theme>> {
  try {
    const session = await getSession();
    // A background read: never send the person away from the page over it.
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const id = publicIdSchema.parse(publicId);
    await enforceRateLimit("readByUser", session.user.id);
    const viewable = await getViewableArtifact(id, session.user.id);
    if (!viewable) return { success: false, error: "Artifact not found." };
    const { theme } = await resolveThemeFor(viewable.record, viewable.view.theme);
    return { success: true, data: theme };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The artifact's theme could not load.") };
  }
}
