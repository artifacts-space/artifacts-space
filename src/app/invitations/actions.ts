"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage, apiErrorCode } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getAuth } from "@/lib/auth/server";
import { getSession } from "@/lib/session";
import { invitationRefusal } from "@/lib/teams/invitation-rules";
import { getInvitationForEmail, getTeamMembershipById } from "@/lib/teams/queries";
import { teamWelcome } from "@/lib/teams/team-rule-copy";

const invitationIdSchema = z.string().trim().min(1).max(200);

/** The signed-in person and their open invitation, only when it is addressed to them. */
async function requireOwnInvitation(invitationId: string) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const invitation = await getInvitationForEmail(invitationIdSchema.parse(invitationId), session.user.email);
  return { userId: session.user.id, invitation };
}

/** What the new member lands on: the team's workspace, with a short welcome that states the team's rule. */
export interface JoinedTeam {
  slug: string;
  welcome: { title: string; description: string };
}

/** The welcome for the role the person now holds. A failed lookup keeps a plain welcome; they joined either way. */
async function welcomeFor(userId: string, teamId: string, teamName: string): Promise<JoinedTeam["welcome"]> {
  const fallback = { title: `Welcome to ${teamName}`, description: "You can edit the team's artifacts right away." };
  try {
    const membership = await getTeamMembershipById(userId, teamId);
    return membership ? teamWelcome(teamName, membership) : fallback;
  } catch (error) {
    console.error("[teams] The welcome could not load the new member's role", error instanceof Error ? error.name : "unknown error");
    return fallback;
  }
}

/** Accepts an invitation and returns where to land: the team's workspace and its welcome. */
export async function acceptInvitationAction(invitationId: string): Promise<ActionResult<JoinedTeam>> {
  try {
    const { userId, invitation } = await requireOwnInvitation(invitationId);
    if (!invitation) return { success: false, error: "This invitation is no longer open." };
    await getAuth().api.acceptInvitation({ body: { invitationId: invitation.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: { slug: invitation.teamSlug, welcome: await welcomeFor(userId, invitation.teamId, invitation.teamName) } };
  } catch (error) {
    return { success: false, error: invitationRefusal(apiErrorCode(error)) ?? actionErrorMessage(error, "The invitation could not be accepted. Please try again.") };
  }
}

/** Declines an invitation. */
export async function declineInvitationAction(invitationId: string): Promise<ActionResult<null>> {
  try {
    const { invitation } = await requireOwnInvitation(invitationId);
    if (!invitation) return { success: false, error: "This invitation is no longer open." };
    await getAuth().api.rejectInvitation({ body: { invitationId: invitation.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: invitationRefusal(apiErrorCode(error)) ?? actionErrorMessage(error, "The invitation could not be declined. Please try again.") };
  }
}
