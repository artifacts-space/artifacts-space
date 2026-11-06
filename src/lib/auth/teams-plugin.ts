import { organization } from "better-auth/plugins";

import { assertMemberIsNotAgent } from "@/lib/auth/agent-guards";
import { reconcileAfterDeparture } from "@/lib/auth/team-departure";
import { assertInvitableRole, assertNotPersonal, assertTeamUpdateAllowed, prepareNewTeam } from "@/lib/teams/guards";
import { sendTeamInvitationEmail } from "@/lib/teams/invitation-email";
import { assertCanInvite } from "@/lib/teams/invitation-limits";

const sevenDays = 60 * 60 * 24 * 7;

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
    // Deleting a team with shared artifacts needs its own design. Not offered yet.
    disableOrganizationDeletion: true,
    invitationExpiresIn: sevenDays,
    cancelPendingInvitationsOnReInvite: true,
    requireEmailVerificationOnInvitation: true,
    sendInvitationEmail: async (data) => {
      await sendTeamInvitationEmail({
        invitationId: data.id,
        email: data.email,
        teamName: data.organization.name,
        inviterName: data.inviter.user.name || data.inviter.user.email,
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
      beforeCreateOrganization: async ({ organization: data, user }) => ({
        data: { ...data, ...(await prepareNewTeam(data, user.id)) },
      }),
      beforeUpdateOrganization: async ({ organization: update, member }) => {
        await assertTeamUpdateAllowed(update, member);
      },
      beforeAddMember: async ({ organization: team, member }) => {
        assertNotPersonal(team, "add members");
        await assertMemberIsNotAgent(member.userId, "join another team");
      },
      beforeCreateInvitation: async ({ invitation, inviter, organization: team }) => {
        assertNotPersonal(team, "invite people");
        assertInvitableRole(invitation.role);
        await assertCanInvite(inviter.id, team.id);
      },
      afterRemoveMember: ({ organization: team }) => reconcileAfterDeparture(team.id),
      beforeUpdateMemberRole: async ({ organization: team, member }) => {
        assertNotPersonal(team, "change roles");
        await assertMemberIsNotAgent(member.userId, "change roles");
      },
    },
  });
}
