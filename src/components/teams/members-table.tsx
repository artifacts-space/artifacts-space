import type { TeamAgentView } from "@/lib/agents/queries";
import { canEditMemberRow } from "@/lib/teams/member-row-rules";
import type { PendingInvitationView, TeamMemberView } from "@/lib/teams/queries";
import type { TeamRole } from "@/lib/teams/roles";

import { AddAgentDialog } from "./add-agent-dialog";
import { AgentMemberRow } from "./agent-member-row";
import { InviteDialog } from "./invite-dialog";
import { InvitationRow, PersonRow } from "./member-rows";
import { cell } from "./member-table-cells";
import { Section } from "./section";

export interface MembersTableProps {
  teamId: string;
  personal: boolean;
  viewerId: string;
  viewerRole: TeamRole;
  /** The viewer is an owner or admin of a shared team. */
  canManage: boolean;
  members: TeamMemberView[];
  agents: TeamAgentView[];
  invitations: PendingInvitationView[];
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

function description(personal: boolean, canManage: boolean) {
  if (personal) return "Your personal team is only you. Create a team to share with others.";
  return canManage ? "People and agents in this team. Invitations wait here until they are accepted." : "People and agents in this team.";
}

/**
 * People, agent teammates, and open invitations in one table. Owners and
 * admins change roles, remove people, manage agents, and handle invitations;
 * "Invite people" and "Add agent" open dialogs from the card's header.
 */
export function MembersTable(props: MembersTableProps) {
  const ownerCount = props.members.filter((member) => member.role === "owner").length;
  const actions = props.canManage ? (
    <div className="flex flex-wrap gap-2">
      <AddAgentDialog teamId={props.teamId} />
      <InviteDialog teamId={props.teamId} />
    </div>
  ) : undefined;
  return (
    <Section title="Members" description={description(props.personal, props.canManage)} action={actions}>
      {/* relative: the role picker's hidden input is absolutely placed and must stay inside the card. */}
      <div className="relative">
        <table className="w-full border-collapse text-sm" aria-label="Members">
          <Head />
          <tbody>
            {props.members.map((member) => {
              const editable = canEditMemberRow({ canManage: props.canManage, viewerId: props.viewerId, viewerRole: props.viewerRole, member, ownerCount });
              return <PersonRow key={member.memberId} member={member} teamId={props.teamId} viewerRole={props.viewerRole} isViewer={member.userId === props.viewerId} editable={editable} />;
            })}
            {props.agents.map((agent) => <AgentMemberRow key={agent.userId} agent={agent} canManage={props.canManage} origin={props.origin} />)}
            {props.invitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} teamId={props.teamId} />)}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
