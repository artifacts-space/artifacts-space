import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { getEditableArtifact } from "@/lib/access";
import { toArtifactDtos } from "@/lib/artifacts";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

/*
 * What every file action shares (file-actions.ts, page-file-actions.ts):
 * the session check, the error words a person reads, and the artifact as
 * its editor sees it after a change.
 */

/**
 * Runs a file action for the signed-in person. A refusal comes back in the
 * words a person reads (UserFacingError, zod), anything else as `fallback`,
 * logged by its name only.
 */
export async function runFileAction<T>(fallback: string, action: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    return { success: true, data: await action(session.user.id) };
  } catch (error) {
    if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
      console.error("[files] Action failed", error instanceof Error ? error.name : "unknown error");
    }
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

/** The artifact as this editor sees it, read again after a change. Refuses one they may not edit. */
export async function editableArtifactDto(userId: string, artifactId: string): Promise<ArtifactDto> {
  const record = await getEditableArtifact(userId, { id: artifactId });
  if (!record) throw new UserFacingError("Artifact not found.");
  const [dto] = await toArtifactDtos([record], userId);
  if (!dto) throw new UserFacingError("Artifact not found.");
  return dto;
}
