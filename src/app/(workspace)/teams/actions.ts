"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getAuth } from "@/lib/auth/server";
import { cleanHandleInput } from "@/lib/handles";
import type { TeamRoleView } from "@/lib/teams/capabilities";
import { can, type TeamCapability } from "@/lib/teams/capability-rules";
import { assignRoleProblem, inviteProblem, leaveProblem, removeMemberProblem } from "@/lib/teams/role-admin-rules";
import { recordMemberRole } from "@/lib/teams/role-store";
import { listTeamMemberActors, type TeamMemberActor, type TeamMembership } from "@/lib/teams/queries";
import { assignableRoles, type TeamRole } from "@/lib/teams/roles";
import { UserFacingError } from "@/lib/user-facing-error";

import { guardTeam, idSchema, requireUser } from "./team-guard";

const roleKeySchema = z.string().trim().min(1).max(40);


/** A person (never an agent's token) in a shared team who holds `capability`. */
function holds(capability: TeamCapability) {
  return (membership: TeamMembership) => membership.kind === "person" && !membership.personal && can(membership, capability);
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

/** Invites someone by email, to a role that does no more than the inviter's. Never to a personal team. */
export async function inviteMemberAction(teamId: string, input: z.input<typeof inviteSchema>): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, holds("members.invite"), "You cannot invite people to this team.");
    if (!checked.ok) return checked.result;
    const { email, role } = inviteSchema.parse(input);
    const grant = checked.roles.get(role);
    const problem = inviteProblem(checked.membership, { key: role, capabilities: grant?.capabilities ?? [] });
    if (problem) return { success: false, error: problem };
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

/** Cancels an open invitation. Needs "invite people". */
export async function cancelInvitationAction(teamId: string, invitationId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, holds("members.invite"), "You cannot cancel invitations in this team.");
    if (!checked.ok) return checked.result;
    await getAuth().api.cancelInvitation({ body: { invitationId: idSchema.parse(invitationId) }, headers: await headers() });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The invitation could not be canceled. Please try again.") };
  }
}

/** How many people in the team are owners. */
function countOwners(members: readonly TeamMemberActor[]) {
  return members.filter((member) => !member.isAgent && member.actor.roleKey === "owner").length;
}

/** The member being changed and how many owners the team has. Unknown members read as not found. */
async function loadTarget(membership: TeamMembership, roles: ReadonlyMap<string, TeamRoleView>, memberId: string) {
  const members = await listTeamMemberActors(membership.id, roles);
  const target = members.find((member) => member.memberId === memberId);
  if (!target) throw new UserFacingError("Member not found.");
  return { target, ownerCount: countOwners(members), targetRole: { roleKey: target.actor.roleKey, capabilities: target.actor.capabilities, isAgent: target.isAgent, isSelf: target.userId === membership.userId } };
}

/** Removes a member below the viewer. Their artifacts shared with the team move to the team. */
export async function removeMemberAction(teamId: string, memberId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, holds("members.remove"), "You cannot remove people from this team.");
    if (!checked.ok) return checked.result;
    const { target, targetRole, ownerCount } = await loadTarget(checked.membership, checked.roles, idSchema.parse(memberId));
    const problem = removeMemberProblem(checked.membership, targetRole, ownerCount);
    if (problem) return { success: false, error: problem };
    // Remove exactly the member the checks above looked at, never the raw input.
    await getAuth().api.removeMember({
      body: { memberIdOrEmail: target.memberId, organizationId: checked.membership.id },
      headers: await headers(),
    });
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The member could not be removed. Please try again.") };
  }
}

/** The role Better Auth stores for a role key: the built-in role itself, or Member under a custom role. */
function storedRole(roleKey: string): TeamRole {
  return roleKey === "owner" || roleKey === "admin" ? roleKey : "member";
}

/**
 * Stores a role change. Better Auth's membership row comes first, because
 * it cannot join our statement; then one statement records the custom role
 * assignment and its audit row together. When that statement fails, the
 * Better Auth role is put back, so a half-applied change never stays.
 */
async function applyRole(input: { membership: TeamMembership; target: TeamMemberActor; next: TeamRoleView; previousName: string }) {
  const { membership, target, next } = input;
  const setStoredRole = async (role: TeamRole) => {
    await getAuth().api.updateMemberRole({ body: { memberId: target.memberId, role, organizationId: membership.id }, headers: await headers() });
  };
  await setStoredRole(storedRole(next.key));
  try {
    const audit = { actorId: membership.userId, action: "member_role_changed" as const, subject: target.name, before: { role: input.previousName }, after: { role: next.name } };
    await recordMemberRole({ teamId: membership.id, memberId: target.memberId, roleId: next.builtIn ? null : next.id, audit });
  } catch (error) {
    await setStoredRole(storedRole(target.actor.roleKey)).catch((undoError: unknown) => {
      console.error("[teams] could not undo a role change", { memberId: target.memberId, undoError });
    });
    throw error;
  }
}

/** Gives a member another role, built-in or custom. Escalation and the last owner are refused (role-admin-rules.ts); every change is audited. */
export async function updateMemberRoleAction(teamId: string, memberId: string, roleKey: string): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, holds("members.roles"), "You cannot change roles in this team.");
    if (!checked.ok) return checked.result;
    const { membership, roles } = checked;
    const next = roles.get(roleKeySchema.parse(roleKey));
    if (!next) return { success: false, error: "That role does not exist in this team." };
    const { target, targetRole, ownerCount } = await loadTarget(membership, roles, idSchema.parse(memberId));
    const problem = assignRoleProblem(membership, targetRole, { key: next.key, capabilities: next.capabilities }, ownerCount);
    if (problem) return { success: false, error: problem };
    await applyRole({ membership, target, next, previousName: roles.get(target.actor.roleKey)?.name ?? target.actor.roleKey });
    revalidatePath(`/teams/${membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be changed. Please try again.") };
  }
}

/** Leaves a team. Artifacts the viewer shared with it stay with the team. The last owner cannot leave. */
export async function leaveTeamAction(teamId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, (m) => !m.personal, "You cannot leave your personal team.");
    if (!checked.ok) return checked.result;
    const problem = leaveProblem(checked.membership, countOwners(await listTeamMemberActors(checked.membership.id, checked.roles)));
    if (problem) return { success: false, error: problem };
    await getAuth().api.leaveOrganization({ body: { organizationId: checked.membership.id }, headers: await headers() });
    revalidatePath("/teams");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "You could not leave the team. Please try again.") };
  }
}

/** Sets whether sharing with the team needs approval. Needs "change the sharing rule" (owners by default). */
export async function updateSharingRuleAction(teamId: string, teamSharingNeedsApproval: boolean): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, holds("settings.sharing"), "You cannot change the sharing rule in this team.");
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
