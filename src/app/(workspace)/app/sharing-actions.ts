"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import { artifactVisibilities, type ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";
import { decideSharingRequest, requestArtifactSharing, withdrawArtifactSharing, type SharingResult } from "@/lib/sharing/service";

const idSchema = z.string().trim().min(1).max(200);
const shareSchema = z.object({
  visibility: z.enum(artifactVisibilities),
  teamId: idSchema.nullable().optional(),
});

async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

/**
 * Changes who can read the viewer's own artifact, through the team's sharing
 * rule. The result says whether it applied now or waits for approval.
 */
export async function shareArtifactAction(artifactId: string, input: z.input<typeof shareSchema>): Promise<ActionResult<SharingResult>> {
  try {
    const requesterId = await requireUserId();
    const { visibility, teamId } = shareSchema.parse(input);
    const result = await requestArtifactSharing({ requesterId, artifactId: idSchema.parse(artifactId), visibility, teamId, actor: "person" });
    revalidatePath("/app");
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Sharing could not be changed. Please try again.") };
  }
}

/** Approves or denies a sharing request. Team owners and admins only. */
export async function decideSharingAction(requestId: string, approve: boolean): Promise<ActionResult<null>> {
  try {
    const deciderId = await requireUserId();
    await decideSharingRequest({ deciderId, requestId: idSchema.parse(requestId), approve: z.boolean().parse(approve) });
    revalidatePath("/teams", "layout");
    revalidatePath("/app");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The request could not be decided. Please try again.") };
  }
}

/** Makes an artifact private again. Its author or an owner or admin of its team. */
export async function withdrawSharingAction(artifactId: string): Promise<ActionResult<null>> {
  try {
    const viewerId = await requireUserId();
    await withdrawArtifactSharing({ viewerId, artifactId: idSchema.parse(artifactId) });
    revalidatePath("/teams", "layout");
    revalidatePath("/app");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Sharing could not be withdrawn. Please try again.") };
  }
}
