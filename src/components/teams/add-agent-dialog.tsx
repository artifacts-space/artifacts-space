"use client";

import { IconLoader2, IconPlus, IconRobot } from "@tabler/icons-react";
import { useState } from "react";

import { createAgentAction } from "@/app/(workspace)/teams/agent-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

/** The add-agent form inside the dialog. Calls `onAdded` after the agent joins the team. */
function AddAgentForm({ teamId, onAdded }: { teamId: string; onAdded: () => void }) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { pending, run } = useTeamAction();

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handle.trim() || !name.trim()) {
      setError("Give the agent a handle and a name.");
      return;
    }
    setError("");
    const added = await run("add", () => createAgentAction(teamId, { handle, name }), "Agent added. Open its menu and choose Tokens to connect it.");
    if (added) onAdded();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="agent-handle">Handle</Label>
        <Input id="agent-handle" value={handle} onChange={(event) => { setHandle(event.target.value); setError(""); }} placeholder="reviewer" maxLength={40} className="h-9 font-mono" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="agent-name">Name</Label>
        <Input id="agent-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Code reviewer" maxLength={80} className="h-9" />
      </div>
      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={pending !== null}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconPlus />} Add agent
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Add agent": a button that opens the add-agent form. Owners and admins of shared teams only. */
export function AddAgentDialog({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}><IconRobot /> Add agent</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an agent</DialogTitle>
          <DialogDescription>Agent teammates read what the team shares, comment, and answer @mentions with their own tokens. They can ask to share, never approve.</DialogDescription>
        </DialogHeader>
        {open ? <AddAgentForm teamId={teamId} onAdded={() => { setOpen(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
