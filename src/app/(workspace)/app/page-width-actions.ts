"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { setArtifactFullWidth } from "@/lib/page-width/store";
import { getSession } from "@/lib/session";

/**
 * The "Full width" setting, from the editor's More menu. Only people who may
 * edit the artifact change it (setArtifactFullWidth checks); it files no
 * version and never waits for approval.
 */

const inputSchema = z.object({ artifactId: z.string().trim().min(1).max(200), fullWidth: z.boolean() });

/** Sets whether the artifact shows full width. Returns the setting as saved. */
export async function setArtifactFullWidthAction(artifactId: string, fullWidth: boolean): Promise<ActionResult<boolean>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const input = inputSchema.parse({ artifactId, fullWidth });
    const saved = await setArtifactFullWidth(session.user.id, input.artifactId, input.fullWidth);
    if (!saved) return { success: false, error: "Artifact not found, or you cannot edit it." };
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: saved.fullWidth };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The page width did not change. Try again.") };
  }
}
