import { organization } from "better-auth/plugins";
import { adminAc, defaultAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";

import { assertMemberIsNotAgent } from "@/lib/auth/agent-guards";
import { reconcileAfterDeparture } from "@/lib/auth/team-departure";
import { assertCanInviteAs, assertInvitableRole, assertNotPersonal, assertTeamCapability, assertTeamUpdateAllowed, prepareNewTeam } from "@/lib/teams/guards";
import { sendTeamInvitationEmail } from "@/lib/teams/invitation-email";
import { assertCanCreateTeam, assertCanInvite } from "@/lib/teams/invitation-limits";
import { teamLimits } from "@/lib/teams/limits";
import { seedBuiltInRoles } from "@/lib/teams/role-store";

const sevenDays = 60 * 60 * 24 * 7;

/**
 * Better Auth's own permission check is only an outer fence. A person with a
 * custom role keeps Better Auth's member role, so member may invite, cancel,
 * update, and remove at this level; the real decision is `can` in
 * capability-rules.ts, which our server actions and the hooks below ask
 * first. The HTTP routes for these calls are closed (teamRoutesClosedOverHttp),
 * so nothing reaches them without that check.
 */
const memberBase = defaultAc.newRole({ ...memberAc.statements, organization: ["update"], member: ["update", "delete"], invitation: ["create", "cancel"] });

/**
 * Better Auth team routes the web app never calls over HTTP. Our server
 * actions call them in-process after `can`; over HTTP they would skip the
 * checks that need the acting user (role changes and removals pass hooks
 * only the target), or show invitations to members who may not invite.
 */
export const teamRoutesClosedOverHttp = [
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/update",
  "/organization/list-invitations",
  "/organization/get-full-organization",
];

/**
 * Better Auth's organization plugin, configured as artifacts.space teams.
 * Its tables are `team`, `team_member`, and `team_invitation` (the adapter
 * maps the model names in server.ts). Guards keep the plugin's HTTP endpoints
 * inside the same rules as the app's own server actions.
 */
export function teamsPlugin() {
  return organization({
    allowUserToCreateOrganization: true,
    creatorRole: "owner",
    roles: { owner: ownerAc, admin: adminAc, member: memberBase },
    // Deleting a team with shared artifacts needs its own design. Not offered yet.
    disableOrganizationDeletion: true,
    membershipLimit: teamLimits.maxMembers,
    invitationExpiresIn: sevenDays,
    cancelPendingInvitationsOnReInvite: true,
    requireEmailVerificationOnInvitation: true,
    sendInvitationEmail: async (data) => {
      await sendTeamInvitationEmail({
        invitationId: data.id,
        email: data.email,
        teamName: data.organization.name,
        inviterName: data.inviter.user.name || data.inviter.user.email,
        expiresAt: new Date(data.invitation.expiresAt),
      });
    },
    schema: {
      organization: {
        additionalFields: {
          personal: { type: "boolean", required: false, defaultValue: false, input: false },
          teamSharingNeedsApproval: { type: "boolean", required: false, defaultValue: true },
          createdBy: { type: "string", required: false, input: false },
        },
      },
      member: { fields: { organizationId: "teamId" } },
      invitation: { fields: { organizationId: "teamId" } },
      session: { fields: { activeOrganizationId: "activeTeamId" } },
    },
    organizationHooks: {
      beforeCreateOrganization: async ({ organization: data, user }) => {
        const prepared = await prepareNewTeam(data, user.id);
        await assertCanCreateTeam(user.id);
        return { data: { ...data, ...prepared } };
      },
      afterCreateOrganization: async ({ organization: created }) => {
        // A team without rows keeps today's rules (capabilities.ts), so a failed seed is logged, never fatal.
        await seedBuiltInRoles(created.id).catch((error: unknown) => {
          console.error("[teams] Seeding roles failed", error instanceof Error ? error.name : "unknown error");
        });
      },
      beforeUpdateOrganization: async ({ organization: update, member }) => {
        // The guard returns the cleaned values (a trimmed name), which replace what was sent.
        return { data: { ...update, ...(await assertTeamUpdateAllowed(update, member)) } };
      },
      beforeAddMember: async ({ organization: team, member }) => {
        assertNotPersonal(team, "add members");
        await assertMemberIsNotAgent(member.userId, "join another team");
      },
      beforeCreateInvitation: async ({ invitation, inviter, organization: team }) => {
        assertNotPersonal(team, "invite people");
        assertInvitableRole(invitation.role);
        await assertCanInviteAs(inviter.id, team.id, invitation.role);
        await assertCanInvite(inviter.id, team.id);
      },
      beforeCancelInvitation: async ({ cancelledBy, organization: team }) => {
        await assertTeamCapability(cancelledBy.id, team.id, "members.invite");
      },
      afterRemoveMember: ({ organization: team }) => reconcileAfterDeparture(team.id),
      beforeUpdateMemberRole: async ({ organization: team, member }) => {
        assertNotPersonal(team, "change roles");
        await assertMemberIsNotAgent(member.userId, "change roles");
      },
    },
  });
}
