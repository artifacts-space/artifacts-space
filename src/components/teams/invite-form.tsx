"use client";

import { IconLoader2, IconSend } from "@tabler/icons-react";
import { useState } from "react";

import { cancelInvitationAction, inviteMemberAction } from "@/app/(workspace)/teams/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PendingInvitationView } from "@/lib/teams/queries";
import { assignableRoles, roleLabel, type AssignableRole } from "@/lib/teams/roles";

import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** Invite by email as a member or an admin. */
export function InviteForm({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const [error, setError] = useState("");
  const { pending, run } = useTeamAction();

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailPattern.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    const sent = await run("invite", () => inviteMemberAction(teamId, { email: email.trim(), role }), "Invitation sent.");
    if (sent) setEmail("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-3 p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="invite-email" className="text-xs">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="teammate@example.com" className="h-9 text-[13px]" />
        </div>
        {/* gap, not space-y: Select renders a hidden input after its trigger, and space-y would add margin under the trigger. */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(value) => { if (value) setRole(value); }}>
            <SelectTrigger className="h-9 w-28 text-[13px]" aria-label="Role for the invited person"><SelectValue /></SelectTrigger>
            <SelectContent>
              {assignableRoles.map((value) => <SelectItem key={value} value={value} className="text-xs">{roleLabel(value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending !== null} className="h-9">
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} Invite
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

/** Open invitations, each with a cancel button. */
export function PendingInvitations({ teamId, invitations }: { teamId: string; invitations: PendingInvitationView[] }) {
  const { pending, run } = useTeamAction();
  if (invitations.length === 0) return null;
  return (
    <ul className="border-t">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex flex-wrap items-center gap-3 border-b px-5 py-2.5 text-[13px] last:border-b-0">
          <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(invitation.role)}</span>
          <span className="text-xs text-muted-foreground">Expires {dateFormat.format(new Date(invitation.expiresAt))}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={pending !== null}
            onClick={() => void run(invitation.id, () => cancelInvitationAction(teamId, invitation.id), "Invitation canceled.")}
          >
            {pending === invitation.id ? <IconLoader2 className="animate-spin" /> : null} Cancel
          </Button>
        </li>
      ))}
    </ul>
  );
}
