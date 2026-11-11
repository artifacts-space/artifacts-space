"use client";

import { IconLink, IconMail, IconSend, IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "@/app/(workspace)/teams/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { PixelAvatar } from "@/components/pixel-avatar";
import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resendableRole, type RoleOption } from "@/lib/teams/member-row-rules";
import type { PendingInvitationView, TeamMemberView } from "@/lib/teams/queries";
import { roleLabel } from "@/lib/teams/roles";

import { cell, dateFormat } from "./member-table-cells";
import { NameCell, RowMenu } from "./member-table-parts";
import { useTeamAction } from "./use-team-action";

function RoleCell({ member, teamId, options }: { member: TeamMemberView; teamId: string; options: readonly RoleOption[] }) {
  const { pending, run } = useTeamAction();
  if (options.length === 0) return <span>{member.roleName}</span>;
  const names = new Map(options.map((option) => [option.key, option.name]));
  return (
    <Select
      value={member.roleKey}
      onValueChange={(role) => {
        if (!role || role === member.roleKey) return;
        void run(member.memberId, () => updateMemberRoleAction(teamId, member.memberId, role), "Role changed.");
      }}
      disabled={pending !== null}
    >
      <SelectTrigger size="sm" className="h-7 w-28 text-sm" aria-label={`Role for ${member.name || "this member"}`}><SelectValue>{(value: string) => names.get(value) ?? member.roleName}</SelectValue></SelectTrigger>
      <SelectContent>
        {options.map((role) => <SelectItem key={role.key} value={role.key}>{role.name}</SelectItem>)}
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

/** One person in the Members table, with a role picker and a ⋯ menu when the viewer may change them (member-row-rules.ts). */
export function PersonRow({ member, teamId, isViewer, roleOptions, canRemove }: { member: TeamMemberView; teamId: string; isViewer: boolean; roleOptions: readonly RoleOption[]; canRemove: boolean }) {
  const detail = [member.username ? `@${member.username}` : "", member.email].filter(Boolean).join(" · ");
  return (
    <tr className="border-t" data-member-row="person">
      <NameCell
        avatar={<PixelAvatar seed={member.userId} size={24} />}
        name={<>{member.name || "Unnamed"}{isViewer ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}</>}
        detail={detail}
      />
      <td className={cell.middle}><RoleCell member={member} teamId={teamId} options={roleOptions} /></td>
      <td className={cell.wide} />
      <td className={`${cell.wide} text-muted-foreground`}>Joined {dateFormat.format(new Date(member.joinedAt))}</td>
      <td className={cell.last}>{canRemove ? <PersonMenu member={member} teamId={teamId} /> : null}</td>
    </tr>
  );
}

/** Where the invitation's own link points. It joins only the invited address, so sharing it another way is safe. */
function invitationLink(origin: string, invitationId: string) {
  return `${origin}/invitations/${encodeURIComponent(invitationId)}`;
}

/**
 * An unanswered invitation in the Members table. Its ⋯ menu copies the link
 * (while it works), sends it again (when the viewer may invite to its role;
 * an expired one gets a new link), and cancels it.
 */
export function InvitationRow({ invitation, teamId, origin, canResend }: { invitation: PendingInvitationView; teamId: string; origin: string; canResend: boolean }) {
  const { pending, run } = useTeamAction();
  const { copy } = useCopyToClipboard();
  const date = dateFormat.format(new Date(invitation.expiresAt));
  const status = invitation.expired ? `Expired ${date}` : `Invited · expires ${date}`;
  const role = canResend ? resendableRole(invitation.role) : null;
  return (
    <tr className="border-t" data-member-row="invitation" data-expired={invitation.expired ? "true" : undefined}>
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
          {invitation.expired ? null : (
            <DropdownMenuItem onClick={() => { void copy(invitationLink(origin, invitation.id)).then((copied) => { if (copied) toast.success("Invitation link copied. It works only for this address."); }); }}>
              <IconLink aria-hidden /> Copy invitation link
            </DropdownMenuItem>
          )}
          {role ? (
            <DropdownMenuItem onClick={() => void run("resend", () => inviteMemberAction(teamId, { email: invitation.email, role }), invitation.expired ? "New invitation sent." : "Invitation sent again.")}>
              <IconSend aria-hidden /> {invitation.expired ? "Send a new invitation" : "Resend"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant="destructive" onClick={() => void run("cancel", () => cancelInvitationAction(teamId, invitation.id), invitation.expired ? "Invitation removed." : "Invitation canceled.")}>
            <IconX aria-hidden /> {invitation.expired ? "Remove" : "Cancel invitation"}
          </DropdownMenuItem>
        </RowMenu>
      </td>
    </tr>
  );
}
