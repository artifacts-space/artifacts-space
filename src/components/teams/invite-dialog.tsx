"use client";

import { IconLoader2, IconSend, IconUserPlus } from "@tabler/icons-react";
import { useState } from "react";

import { inviteMemberAction } from "@/app/(workspace)/teams/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleLabel, type AssignableRole } from "@/lib/teams/roles";

import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The invitation form inside the dialog. Calls `onSent` after the invitation goes out. */
function InviteForm({ teamId, roles, onSent }: { teamId: string; roles: readonly AssignableRole[]; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>(roles.includes("member") ? "member" : roles[0] ?? "member");
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
    if (sent) onSent();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="teammate@example.com" className="h-9" />
      </div>
      {/* gap, not space-y: Select renders a hidden input after its trigger, and space-y would add margin under the trigger. */}
      <div className="relative grid gap-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(value) => { if (value) setRole(value); }}>
          <SelectTrigger className="h-9 w-full text-sm" aria-label="Role for the invited person"><SelectValue>{(value: AssignableRole) => roleLabel(value)}</SelectValue></SelectTrigger>
          <SelectContent>
            {roles.map((value) => <SelectItem key={value} value={value}>{roleLabel(value)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={pending !== null}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} Send invitation
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Invite people": a button that opens the invitation form, offering the roles the viewer may invite to. */
export function InviteDialog({ teamId, roles }: { teamId: string; roles: readonly AssignableRole[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}><IconUserPlus /> Invite people</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>They join when they accept the emailed invitation.</DialogDescription>
        </DialogHeader>
        {/* Remount on open so a closed dialog never keeps an old email or error. */}
        {open ? <InviteForm teamId={teamId} roles={roles} onSent={() => { setOpen(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
