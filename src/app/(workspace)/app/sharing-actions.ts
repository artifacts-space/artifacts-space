"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import { artifactVisibilities, commentSettings, type ActionResult, type ArtifactDto } from "@/lib/artifact-types";
import { getManagedReport, resolveReports } from "@/lib/reports/service";
import { setShowInSearch } from "@/lib/search/search-service";
import { getSession } from "@/lib/session";
import { setArtifactComments, type CommentsChangeResult } from "@/lib/sharing/comments";
import { decideSharingRequest, requestArtifactSharing, withdrawArtifactSharing, type SharingResult } from "@/lib/sharing/service";

const idSchema = z.string().trim().min(1).max(200);
const shareSchema = z.object({
  visibility: z.enum(artifactVisibilities),
  teamId: idSchema.nullable().optional(),
  comments: z.enum(commentSettings).optional(),
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
    const { visibility, teamId, comments } = shareSchema.parse(input);
    const result = await requestArtifactSharing({ requesterId, artifactId: idSchema.parse(artifactId), visibility, teamId, comments, actor: "person" });
    revalidatePath("/app");
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Sharing could not be changed. Please try again.") };
  }
}

/**
 * Changes who can read and write an artifact's comments: its author, or an
 * owner or admin of its team. Opening comments in a shared team to anyone
 * signed in may wait for approval; the result says so.
 */
export async function setCommentsAction(artifactId: string, comments: string): Promise<ActionResult<CommentsChangeResult>> {
  try {
    const actorId = await requireUserId();
    const result = await setArtifactComments({ actorId, artifactId: idSchema.parse(artifactId), comments: z.enum(commentSettings).parse(comments), actor: "person" });
    revalidatePath("/app");
    revalidatePath("/teams", "layout");
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Comments could not be changed. Please try again.") };
  }
}

/**
 * Turns "Show in search engines" on or off for the viewer's own public
 * artifact. Only its author, as a person in the web app; agents cannot.
 */
export async function setShowInSearchAction(artifactId: string, on: boolean): Promise<ActionResult<ArtifactDto>> {
  try {
    const actorId = await requireUserId();
    const artifact = await setShowInSearch({ actorId, artifactId: idSchema.parse(artifactId), on: z.boolean().parse(on), actor: "person" });
    revalidatePath("/app");
    return { success: true, data: artifact };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The search engines setting could not be changed. Please try again.") };
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

/** Dismisses an open report and any others on the same artifact. Team owners and admins only. */
export async function dismissReportAction(reportId: string): Promise<ActionResult<null>> {
  try {
    const viewerId = await requireUserId();
    const { report, team } = await getManagedReport(idSchema.parse(reportId), viewerId);
    await resolveReports({ artifactId: report.artifactId, teamId: team.id, viewerId });
    revalidatePath("/teams", "layout");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The report could not be dismissed. Please try again.") };
  }
}

/** Makes a reported artifact private and resolves its reports. Team owners and admins only. */
export async function withdrawReportedAction(reportId: string): Promise<ActionResult<null>> {
  try {
    const viewerId = await requireUserId();
    const { report, team } = await getManagedReport(idSchema.parse(reportId), viewerId);
    await withdrawArtifactSharing({ viewerId, artifactId: report.artifactId });
    await resolveReports({ artifactId: report.artifactId, teamId: team.id, viewerId });
    revalidatePath("/teams", "layout");
    revalidatePath("/app");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Sharing could not be withdrawn. Please try again.") };
  }
}
