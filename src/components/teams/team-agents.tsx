"use client";

import { IconLoader2, IconPlus, IconRobot, IconTrash, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { useState } from "react";

import { createAgentAction, removeAgentAction, setAgentMuteAction } from "@/app/(workspace)/teams/agent-actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamAgentView } from "@/lib/agents/queries";

import { AgentTokens } from "./agent-tokens";
import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

/** Add an agent with a handle and a display name. */
function AddAgentForm({ teamId }: { teamId: string }) {
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
    const added = await run("add", () => createAgentAction(teamId, { handle, name }), "Agent added. Create a token to connect it.");
    if (added) {
      setHandle("");
      setName("");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-3 border-t p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-40 flex-1 flex-col gap-2">
          <Label htmlFor="agent-handle" className="text-xs">Handle</Label>
          <Input id="agent-handle" value={handle} onChange={(event) => { setHandle(event.target.value); setError(""); }} placeholder="reviewer" maxLength={40} className="h-9 font-mono text-[13px]" />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-2">
          <Label htmlFor="agent-name" className="text-xs">Name</Label>
          <Input id="agent-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Code reviewer" maxLength={80} className="h-9 text-[13px]" />
        </div>
        <Button type="submit" disabled={pending !== null} className="h-9">
          {pending ? <IconLoader2 className="animate-spin" /> : <IconPlus />} Add agent
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

function AgentRow({ agent, canManage }: { agent: TeamAgentView; canManage: boolean }) {
  const { pending, run } = useTeamAction();
  const confirmRemove = useConfirm("removeAgent");
  const muteLabel = agent.muted ? "Unmute" : "Mute";
  return (
    <li className="space-y-3 border-t px-5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <IconRobot className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-mono text-xs">@{agent.handle}</span>
        <span className="font-medium">{agent.name}</span>
        {agent.muted ? <Badge variant="secondary">Muted</Badge> : null}
        <span className="text-xs text-muted-foreground">{agent.ownerName ? `Added by ${agent.ownerName}` : "Added by a former member"}</span>
        {canManage ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={pending !== null}
              onClick={() => void run("mute", () => setAgentMuteAction(agent.userId, !agent.muted), agent.muted ? `@${agent.handle} can post again.` : `@${agent.handle} is muted across the team.`)}
            >
              {pending === "mute" ? <IconLoader2 className="animate-spin" /> : agent.muted ? <IconVolume /> : <IconVolumeOff />} {muteLabel}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove @${agent.handle}`} className="text-muted-foreground hover:text-destructive" disabled={pending !== null} onClick={() => { confirmRemove.request(() => run("remove", () => removeAgentAction(agent.userId), `@${agent.handle} removed.`)); }}>
              {pending === "remove" ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
            </Button>
          </div>
        ) : null}
      </div>
      {canManage ? <AgentTokens agent={agent} /> : null}
      <ConfirmDialog
        state={confirmRemove.dialog}
        title={`Remove @${agent.handle}?`}
        description="Its tokens stop working at once and its handle becomes free. What it shared with the team stays with the team; its comments stay in their threads."
        confirmLabel="Remove"
        pending={pending === "remove"}
      />
    </li>
  );
}

/**
 * The team's agent teammates. Everyone sees them; owners and admins add,
 * mute, and remove agents and manage their tokens.
 */
export function TeamAgents({ teamId, agents, canManage }: { teamId: string; agents: TeamAgentView[]; canManage: boolean }) {
  return (
    <div>
      {agents.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">
          No agents yet.{canManage ? " Add one so it can read what the team shares, comment, and answer mentions." : ""}
        </p>
      ) : (
        <ul>{agents.map((agent) => <AgentRow key={agent.userId} agent={agent} canManage={canManage} />)}</ul>
      )}
      {canManage ? <AddAgentForm teamId={teamId} /> : null}
    </div>
  );
}
