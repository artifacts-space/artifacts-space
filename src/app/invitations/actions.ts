"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getAuth } from "@/lib/auth/server";
import { getSession } from "@/lib/session";
import { getInvitationForEmail } from "@/lib/teams/queries";

const invitationIdSchema = z.string().trim().min(1).max(200);

/** The open invitation, only when it is addressed to the signed-in person. */
async function requireOwnInvitation(invitationId: string) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return getInvitationForEmail(invitationIdSchema.parse(invitationId), session.user.email);
}

/** Accepts an invitation and returns the team's slug. */
export async function acceptInvitationAction(invitationId: string): Promise<ActionResult<{ slug: string }>> {
  try {
    const invitation = await requireOwnInvitation(invitationId);
    if (!invitation) return { success: false, error: "This invitation is no longer open." };
    await getAuth().api.acceptInvitation({ body: { invitationId: invitation.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: { slug: invitation.teamSlug } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The invitation could not be accepted. Please try again.") };
  }
}

/** Declines an invitation. */
export async function declineInvitationAction(invitationId: string): Promise<ActionResult<null>> {
  try {
    const invitation = await requireOwnInvitation(invitationId);
    if (!invitation) return { success: false, error: "This invitation is no longer open." };
    await getAuth().api.rejectInvitation({ body: { invitationId: invitation.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The invitation could not be declined. Please try again.") };
  }
}
