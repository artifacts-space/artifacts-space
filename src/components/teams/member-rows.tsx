"use client";

import { IconMail, IconSend, IconTrash, IconX } from "@tabler/icons-react";

import { cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "@/app/(workspace)/teams/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { PixelAvatar } from "@/components/pixel-avatar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resendableRole, rolesFor } from "@/lib/teams/member-row-rules";
import type { PendingInvitationView, TeamMemberView } from "@/lib/teams/queries";
import { roleLabel, type TeamRole } from "@/lib/teams/roles";

import { cell, dateFormat } from "./member-table-cells";
import { NameCell, RowMenu } from "./member-table-parts";
import { useTeamAction } from "./use-team-action";

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
      <SelectTrigger size="sm" className="h-7 w-24 text-sm" aria-label={`Role for ${member.name || "this member"}`}><SelectValue>{(value: TeamRole) => roleLabel(value)}</SelectValue></SelectTrigger>
      <SelectContent>
        {rolesFor(viewerRole).map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function PersonMenu({ member, teamId }: { member: TeamMemberView; teamId: string }) {
  const { pending, run } = useTeamAction();
  const confirmRemove = useConfirm("removeMember");
  const name = member.name || "this member";
  return (
    <>
      <RowMenu label={`Actions for ${name}`} disabled={pending !== null}>
        <DropdownMenuItem variant="destructive" onClick={() => { confirmRemove.request(() => run("remove", () => removeMemberAction(teamId, member.memberId), `${member.name || "Member"} removed.`)); }}>
          <IconTrash aria-hidden /> Remove from team
        </DropdownMenuItem>
      </RowMenu>
      <ConfirmDialog
        state={confirmRemove.dialog}
        title={`Remove ${name}?`}
        description="They lose access to this team at once. Artifacts they shared with the team stay with the team, and its owners take them over. Agents they added go to the team's owner, and their tokens stop working at once."
        confirmLabel="Remove"
        pending={pending !== null}
      />
    </>
  );
}

/** One person in the Members table, with a role picker and a ⋯ menu when the viewer may change them. */
export function PersonRow({ member, teamId, viewerRole, isViewer, editable }: { member: TeamMemberView; teamId: string; viewerRole: TeamRole; isViewer: boolean; editable: boolean }) {
  const detail = [member.username ? `@${member.username}` : "", member.email].filter(Boolean).join(" · ");
  return (
    <tr className="border-t" data-member-row="person">
      <NameCell
        avatar={<PixelAvatar seed={member.userId} size={24} />}
        name={<>{member.name || "Unnamed"}{isViewer ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}</>}
        detail={detail}
      />
      <td className={cell.middle}><RoleCell member={member} teamId={teamId} editable={editable} viewerRole={viewerRole} /></td>
      <td className={cell.wide} />
      <td className={`${cell.wide} text-muted-foreground`}>Joined {dateFormat.format(new Date(member.joinedAt))}</td>
      <td className={cell.last}>{editable ? <PersonMenu member={member} teamId={teamId} /> : null}</td>
    </tr>
  );
}

/** An open invitation in the Members table, with Resend and Cancel in its ⋯ menu. Owners and admins only. */
export function InvitationRow({ invitation, teamId }: { invitation: PendingInvitationView; teamId: string }) {
  const { pending, run } = useTeamAction();
  const status = `Invited · expires ${dateFormat.format(new Date(invitation.expiresAt))}`;
  const role = resendableRole(invitation.role);
  return (
    <tr className="border-t" data-member-row="invitation">
      <NameCell
        avatar={<span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><IconMail aria-hidden className="size-3.5" /></span>}
        name={invitation.email}
        detail=""
        phoneNote={status}
      />
      <td className={cell.middle}>{roleLabel(invitation.role)}</td>
      <td className={cell.wide} />
      <td className={`${cell.wide} whitespace-nowrap text-muted-foreground`}>{status}</td>
      <td className={cell.last}>
        <RowMenu label={`Actions for the invitation to ${invitation.email}`} disabled={pending !== null}>
          {role ? (
            <DropdownMenuItem onClick={() => void run("resend", () => inviteMemberAction(teamId, { email: invitation.email, role }), "Invitation sent again.")}>
              <IconSend aria-hidden /> Resend
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant="destructive" onClick={() => void run("cancel", () => cancelInvitationAction(teamId, invitation.id), "Invitation canceled.")}>
            <IconX aria-hidden /> Cancel invitation
          </DropdownMenuItem>
        </RowMenu>
      </td>
    </tr>
  );
}
