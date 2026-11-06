"use server";

import { z } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { toArtifactDtos } from "@/lib/artifacts";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");

/**
 * The latest saved artifact, for the in-place editor on its page. Only the
 * author and members of the team it is shared through get it; everyone else
 * gets "not found". The page itself may be cached, so the editor always
 * loads its own copy from the signed-in session.
 */
export async function loadEditableArtifactAction(publicId: string): Promise<ActionResult<ArtifactDto>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const record = await getEditableArtifact(session.user.id, { publicId: publicIdSchema.parse(publicId) });
    if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    const [dto] = await toArtifactDtos([record]);
    if (!dto) throw new UserFacingError("Artifact not found.");
    return { success: true, data: dto };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The artifact could not load for editing. Try again.") };
  }
}
