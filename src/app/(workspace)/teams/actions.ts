"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getAuth } from "@/lib/auth/server";
import { cleanHandleInput } from "@/lib/handles";
import { getSession } from "@/lib/session";
import { getTeamMembershipById, type TeamMembership } from "@/lib/teams/queries";
import { assignableRoles, canEditTeamSettings, canManageTeam } from "@/lib/teams/roles";

const idSchema = z.string().trim().min(1).max(200);

async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/** The viewer's membership in a team, or an error result when they are not a member. */
async function requireMembership(teamId: string) {
  const viewer = await requireUser();
  const membership = await getTeamMembershipById(viewer.id, idSchema.parse(teamId));
  return { viewer, membership };
}

type Guarded = { ok: true; membership: TeamMembership } | { ok: false; result: { success: false; error: string } };

async function guard(teamId: string, allowed: (membership: TeamMembership) => boolean, denied: string): Promise<Guarded> {
  const { membership } = await requireMembership(teamId);
  if (!membership) return { ok: false, result: { success: false, error: "Team not found." } };
  if (!allowed(membership)) return { ok: false, result: { success: false, error: denied } };
  return { ok: true, membership };
}

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Give the team a name.").max(80, "Use 80 characters or fewer for the name."),
  slug: z.string().transform(cleanHandleInput),
  teamSharingNeedsApproval: z.boolean(),
});

/** Creates a team with the viewer as owner. The guards check the slug. */
export async function createTeamAction(input: z.input<typeof createTeamSchema>): Promise<ActionResult<{ slug: string }>> {
  try {
    await requireUser();
    const parsed = createTeamSchema.parse(input);
    const created = await getAuth().api.createOrganization({
      body: { ...parsed, keepCurrentActiveOrganization: true },
      headers: await headers(),
    });
    revalidatePath("/teams");
    return { success: true, data: { slug: created.slug } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The team could not be created. Please try again.") };
  }
}

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(320).transform((value) => value.toLowerCase()),
  role: z.enum(assignableRoles),
});

/** Invites someone by email. Owners and admins only; never to a personal team. */
export async function inviteMemberAction(teamId: string, input: z.input<typeof inviteSchema>): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => canManageTeam(m.role) && !m.personal, "Only owners and admins can invite people.");
    if (!checked.ok) return checked.result;
    const { email, role } = inviteSchema.parse(input);
    await getAuth().api.createInvitation({
      body: { email, role, organizationId: checked.membership.id, resend: true },
      headers: await headers(),
    });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The invitation could not be sent. Please try again.") };
  }
}

/** Cancels an open invitation. */
export async function cancelInvitationAction(teamId: string, invitationId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => canManageTeam(m.role), "Only owners and admins can cancel invitations.");
    if (!checked.ok) return checked.result;
    await getAuth().api.cancelInvitation({ body: { invitationId: idSchema.parse(invitationId) }, headers: await headers() });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The invitation could not be canceled. Please try again.") };
  }
}

/** Removes a member. Their artifacts shared with the team move to the team. */
export async function removeMemberAction(teamId: string, memberId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => canManageTeam(m.role), "Only owners and admins can remove members.");
    if (!checked.ok) return checked.result;
    await getAuth().api.removeMember({
      body: { memberIdOrEmail: idSchema.parse(memberId), organizationId: checked.membership.id },
      headers: await headers(),
    });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The member could not be removed. Please try again.") };
  }
}

const roleSchema = z.enum(["owner", "admin", "member"]);

/** Changes a member's role. Better Auth lets only owners grant or take away the owner role. */
export async function updateMemberRoleAction(teamId: string, memberId: string, role: string): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => canManageTeam(m.role), "Only owners and admins can change roles.");
    if (!checked.ok) return checked.result;
    await getAuth().api.updateMemberRole({
      body: { memberId: idSchema.parse(memberId), role: roleSchema.parse(role), organizationId: checked.membership.id },
      headers: await headers(),
    });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be changed. Please try again.") };
  }
}

/** Leaves a team. Artifacts the viewer shared with it stay with the team. */
export async function leaveTeamAction(teamId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => !m.personal, "You cannot leave your personal team.");
    if (!checked.ok) return checked.result;
    await getAuth().api.leaveOrganization({ body: { organizationId: checked.membership.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "You could not leave the team. Please try again.") };
  }
}

/** Sets whether sharing with the team needs an admin's approval. Owners only. */
export async function updateSharingRuleAction(teamId: string, teamSharingNeedsApproval: boolean): Promise<ActionResult<null>> {
  try {
    const checked = await guard(teamId, (m) => canEditTeamSettings(m.role) && !m.personal, "Only team owners can change the sharing rule.");
    if (!checked.ok) return checked.result;
    await getAuth().api.updateOrganization({
      body: { organizationId: checked.membership.id, data: { teamSharingNeedsApproval: z.boolean().parse(teamSharingNeedsApproval) } },
      headers: await headers(),
    });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The sharing rule could not be saved. Please try again.") };
  }
}
