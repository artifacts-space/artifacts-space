"use client";

import { IconCheck, IconLoader2, IconSend, IconUserPlus } from "@tabler/icons-react";
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

/** A role the viewer may invite to, with one line about what it lets the person do. */
export interface InviteRoleOption {
  role: AssignableRole;
  hint: string;
}

interface SentInvitation {
  email: string;
  resent: boolean;
}

/** The addresses sent from this dialog, newest last, so inviting a second person keeps the first in view. */
function SentList({ sent }: { sent: readonly SentInvitation[] }) {
  if (sent.length === 0) return null;
  return (
    <ul aria-label="Invitations sent" className="grid gap-1 text-sm text-muted-foreground">
      {sent.map((item) => (
        <li key={item.email} className="flex min-w-0 items-center gap-1.5">
          <IconCheck aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{item.resent ? `Sent again to ${item.email}` : `Sent to ${item.email}`}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The invitation form inside the dialog. After each send it clears the
 * address and stays open, so a second person is one more address away.
 */
function InviteForm({ teamId, roles, onDone }: { teamId: string; roles: readonly InviteRoleOption[]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>(roles.some((option) => option.role === "member") ? "member" : roles[0]?.role ?? "member");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<SentInvitation[]>([]);
  const { pending, run } = useTeamAction();
  const hint = roles.find((option) => option.role === role)?.hint ?? "";

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailPattern.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    const delivered: { value: SentInvitation | null } = { value: null };
    const ok = await run("invite", async () => {
      const result = await inviteMemberAction(teamId, { email: email.trim(), role });
      if (result.success) delivered.value = result.data;
      return result;
    }, "Invitation sent.");
    const done = delivered.value;
    if (!ok || !done) return;
    setSent((items) => [...items.filter((item) => item.email !== done.email), done]);
    setEmail("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" autoFocus value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="teammate@example.com" className="h-9" />
      </div>
      {/* gap, not space-y: Select renders a hidden input after its trigger, and space-y would add margin under the trigger. */}
      <div className="relative grid gap-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(value) => { if (value) setRole(value); }}>
          <SelectTrigger className="h-9 w-full text-sm" aria-label="Role for the invited person" aria-describedby="invite-role-hint"><SelectValue>{(value: AssignableRole) => roleLabel(value)}</SelectValue></SelectTrigger>
          <SelectContent>
            {roles.map((option) => <SelectItem key={option.role} value={option.role}>{roleLabel(option.role)}</SelectItem>)}
          </SelectContent>
        </Select>
        <p id="invite-role-hint" className="text-sm leading-5 text-muted-foreground">{hint}</p>
      </div>
      <FormError message={error} />
      <div aria-live="polite"><SentList sent={sent} /></div>
      <DialogFooter>
        {sent.length > 0 ? <Button type="button" variant="ghost" onClick={onDone}>Done</Button> : null}
        <Button type="submit" disabled={pending !== null}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconSend />} {sent.length > 0 ? "Send another" : "Send invitation"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Invite people": a button that opens the invitation form, offering the roles the viewer may invite to. */
export function InviteDialog({ teamId, roles }: { teamId: string; roles: readonly InviteRoleOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}><IconUserPlus /> Invite people</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            They can edit the team&apos;s artifacts as soon as they join. The emailed link works for 7 days, and only for the address you enter.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open so a closed dialog never keeps an old email, error, or sent list. */}
        {open ? <InviteForm teamId={teamId} roles={roles} onDone={() => { setOpen(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
