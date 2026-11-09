"use client";

import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { useState } from "react";

import { createRoleAction } from "@/app/(workspace)/teams/role-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { capabilityLabels } from "@/lib/teams/capability-labels";
import type { TeamCapability } from "@/lib/teams/capability-rules";
import { customRoleNameMaxLength, customRoleNameProblem } from "@/lib/teams/role-admin-rules";

import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

function NewRoleForm({ teamId, grantable, onCreated }: { teamId: string; grantable: readonly TeamCapability[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<TeamCapability>>(() => new Set());
  const [error, setError] = useState("");
  const { pending, run } = useTeamAction();

  function toggle(capability: TeamCapability, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(capability);
      else next.delete(capability);
      return next;
    });
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = customRoleNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const created = await run("create", () => createRoleAction(teamId, { name, capabilities: grantable.filter((item) => picked.has(item)) }), `${name.trim()} created. Give it to people from the Members tab.`);
    if (created) onCreated();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="role-name">Name</Label>
        <Input id="role-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Designer" maxLength={customRoleNameMaxLength} className="h-9" />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">What it can do</legend>
        {grantable.map((capability) => (
          <label key={capability} className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-0.5" checked={picked.has(capability)} onCheckedChange={(on) => { toggle(capability, on); }} />
            <span>
              <span className="block font-medium">{capabilityLabels[capability].label}</span>
              <span className="block text-xs text-muted-foreground">{capabilityLabels[capability].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={pending !== null}>{pending ? <IconLoader2 className="animate-spin" /> : <IconPlus />} Create role</Button>
      </DialogFooter>
    </form>
  );
}

/** "New role": a custom role between Member and Admin, with capabilities the viewer holds. */
export function NewRoleDialog({ teamId, grantable }: { teamId: string; grantable: readonly TeamCapability[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}><IconPlus /> New role</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>A role for people in this team, such as Designer. You can give it only what your own role can do.</DialogDescription>
        </DialogHeader>
        {open ? <NewRoleForm teamId={teamId} grantable={grantable} onCreated={() => { setOpen(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
