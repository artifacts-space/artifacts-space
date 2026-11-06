"use client";

import { IconLoader2, IconTrash } from "@tabler/icons-react";

import { removeMemberAction, updateMemberRoleAction } from "@/app/(workspace)/teams/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeamMemberView } from "@/lib/teams/queries";
import { roleLabel, teamRoles, type TeamRole } from "@/lib/teams/roles";

import { useTeamAction } from "./use-team-action";

interface TeamMembersProps {
  teamId: string;
  members: TeamMemberView[];
  viewerId: string;
  viewerRole: TeamRole;
  canManage: boolean;
}

/** Roles the viewer may pick for another member. Only owners grant the owner role. */
function rolesFor(viewerRole: TeamRole) {
  return viewerRole === "owner" ? teamRoles : teamRoles.filter((role) => role !== "owner");
}

function RoleCell({ member, teamId, editable, viewerRole }: { member: TeamMemberView; teamId: string; editable: boolean; viewerRole: TeamRole }) {
  const { pending, run } = useTeamAction();
  if (!editable) return <span>{roleLabel(member.role)}</span>;
  return (
    <Select
      value={member.role}
      onValueChange={(role) => {
        if (!role || role === member.role) return;
        void run(member.memberId, () => updateMemberRoleAction(teamId, member.memberId, role), "Role changed.");
      }}
      disabled={pending !== null}
    >
      <SelectTrigger size="sm" className="h-7 w-28 text-xs" aria-label={`Role for ${member.name}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        {rolesFor(viewerRole).map((role) => <SelectItem key={role} value={role} className="text-xs">{roleLabel(role)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ member, teamId }: { member: TeamMemberView; teamId: string }) {
  const { pending, run } = useTeamAction();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending !== null}
      aria-label={`Remove ${member.name}`}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => void run("remove", () => removeMemberAction(teamId, member.memberId), `${member.name || "Member"} removed.`)}
    >
      {pending ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
    </Button>
  );
}

/** Members with their roles. Owners and admins change roles and remove people. */
export function TeamMembers({ teamId, members, viewerId, viewerRole, canManage }: TeamMembersProps) {
  return (
    // relative: the role picker's hidden input is absolutely placed and must stay inside this scroller.
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-5 py-2 font-normal">Name</th>
            <th className="px-3 py-2 font-normal">Username</th>
            <th className="px-3 py-2 font-normal">Email</th>
            <th className="px-3 py-2 font-normal">Role</th>
            <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isViewer = member.userId === viewerId;
            const editable = canManage && !isViewer && (viewerRole === "owner" || member.role !== "owner");
            return (
              <tr key={member.memberId} className="border-t">
                <td className="px-5 py-2.5 font-medium">{member.name || "Unnamed"}{isViewer ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{member.username ? `@${member.username}` : ""}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{member.email}</td>
                <td className="px-3 py-2.5"><RoleCell member={member} teamId={teamId} editable={editable} viewerRole={viewerRole} /></td>
                <td className="px-5 py-2.5 text-right">{editable ? <RemoveButton member={member} teamId={teamId} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
