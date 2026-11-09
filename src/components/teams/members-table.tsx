import type { TeamAgentView } from "@/lib/agents/queries";
import { can } from "@/lib/teams/capability-rules";
import { memberRowControls, type RoleOption } from "@/lib/teams/member-row-rules";
import type { PendingInvitationView, TeamMemberView, TeamMembership } from "@/lib/teams/queries";
import { inviteProblem } from "@/lib/teams/role-admin-rules";
import { assignableRoles, type AssignableRole } from "@/lib/teams/roles";

import { AddAgentDialog } from "./add-agent-dialog";
import { AgentMemberRow } from "./agent-member-row";
import { InviteDialog } from "./invite-dialog";
import { InvitationRow, PersonRow } from "./member-rows";
import { cell } from "./member-table-cells";
import { Section } from "./section";

export interface MembersTableProps {
  /** The viewer's membership: their role and what it may do. */
  viewer: TeamMembership;
  members: TeamMemberView[];
  agents: TeamAgentView[];
  invitations: PendingInvitationView[];
  /** Every role in the team, for the role pickers. */
  roles: readonly RoleOption[];
  origin: string;
}

function Head() {
  return (
    <thead>
      <tr className="text-left text-xs text-muted-foreground">
        <th className={`${cell.first} py-2 font-normal`}>Name</th>
        <th className={`${cell.middle} py-2 font-normal`}>Role</th>
        <th className={`${cell.wide} py-2 font-normal whitespace-nowrap`}>Added by</th>
        <th className={`${cell.wide} py-2 font-normal`}>Status</th>
        <th className={`${cell.last} py-2`}><span className="sr-only">Actions</span></th>
      </tr>
    </thead>
  );
}

function description(personal: boolean, canInvite: boolean) {
  if (personal) return "Your personal team is only you. Create a team to share with others.";
  return canInvite ? "People and agents in this team. Invitations wait here until they are accepted." : "People and agents in this team.";
}

function HeaderActions({ teamId, inviteRoles, canAddAgents }: { teamId: string; inviteRoles: readonly AssignableRole[]; canAddAgents: boolean }) {
  if (inviteRoles.length === 0 && !canAddAgents) return undefined;
  return (
    <div className="flex flex-wrap gap-2">
      {canAddAgents ? <AddAgentDialog teamId={teamId} /> : null}
      {inviteRoles.length > 0 ? <InviteDialog teamId={teamId} roles={inviteRoles} /> : null}
    </div>
  );
}

/**
 * People, agent teammates, and open invitations in one table. What the
 * viewer may change comes from their role (member-row-rules.ts, which asks
 * the same rules as the server). "Invite people" and "Add agent" open
 * dialogs from the card's header.
 */
export function MembersTable({ viewer, members, agents, invitations, roles, origin }: MembersTableProps) {
  const ownerCount = members.filter((member) => member.roleKey === "owner").length;
  const shared = !viewer.personal && viewer.kind === "person";
  const canInvite = shared && can(viewer, "members.invite");
  const canAddAgents = shared && can(viewer, "agents.manage");
  const grantFor = (key: string) => roles.find((role) => role.key === key) ?? { key, capabilities: [] };
  const inviteRoles = canInvite ? assignableRoles.filter((key) => inviteProblem(viewer, grantFor(key)) === null) : [];
  return (
    <Section title="Members" description={description(viewer.personal, canInvite)} action={HeaderActions({ teamId: viewer.id, inviteRoles, canAddAgents })}>
      {/* relative: the role picker's hidden input is absolutely placed and must stay inside the card. */}
      <div className="relative">
        <table className="w-full border-collapse text-sm" aria-label="Members">
          <Head />
          <tbody>
            {members.map((member) => {
              const controls = memberRowControls({ viewer, member, roles, ownerCount });
              return <PersonRow key={member.memberId} member={member} teamId={viewer.id} isViewer={member.userId === viewer.userId} roleOptions={controls.roleOptions} canRemove={controls.canRemove} />;
            })}
            {agents.map((agent) => <AgentMemberRow key={agent.userId} agent={agent} canManage={canAddAgents} origin={origin} />)}
            {invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} teamId={viewer.id} canResend={canInvite && inviteProblem(viewer, grantFor(invitation.role)) === null} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
