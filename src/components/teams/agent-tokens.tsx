"use client";

import { IconKey, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { createAgentTokenAction, revokeAgentTokenAction } from "@/app/(workspace)/teams/agent-actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TeamAgentView } from "@/lib/agents/queries";

import { FormError } from "./form-error";
import { useTeamAction } from "./use-team-action";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** The secret, shown once right after it is created. */
function NewTokenDialog({ token, handle, onClose }: { token: string; handle: string; onClose: () => void }) {
  return (
    <Dialog open={Boolean(token)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Token for @{handle}</DialogTitle>
          <DialogDescription className="leading-6">
            Copy it now. It will not be shown again. The agent acts as @{handle} with it and sees only what the team can see.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-background/60 p-1.5 pl-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{token}</code>
          <CopyButton value={token} label="Copy" variant="secondary" size="sm" />
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An agent's tokens: create one (shown once), or revoke one. Owners and admins only. */
export function AgentTokens({ agent }: { agent: TeamAgentView }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [creating, setCreating] = useState(false);
  const { pending, run } = useTeamAction();

  async function create(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give this token a name.");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const result = await createAgentTokenAction(agent.userId, name);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSecret(result.data.token);
      setName("");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-background/60 p-3">
      {agent.tokens.length === 0 ? <p className="text-xs text-muted-foreground">No tokens yet. Create one to connect this agent.</p> : null}
      <ul className="space-y-1">
        {agent.tokens.map((token) => (
          <li key={token.id} className="flex items-center gap-2 text-xs">
            <IconKey className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium">{token.name}</span>
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">{token.prefix}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {token.lastUsedAt ? `Used ${dateFormat.format(new Date(token.lastUsedAt))}` : "Never used"}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Revoke ${token.name}`}
              disabled={pending !== null}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void run(token.id, () => revokeAgentTokenAction(agent.userId, token.id), "Token revoked.")}
            >
              {pending === token.id ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void create(event)} noValidate className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => { setName(event.target.value); setError(""); }}
          maxLength={80}
          placeholder="Token name, like CI runner"
          aria-label={`New token name for @${agent.handle}`}
          className="h-8 min-w-0 text-[13px]"
        />
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={creating}>
          {creating ? <IconLoader2 className="animate-spin" /> : <IconPlus />} Token
        </Button>
      </form>
      <FormError message={error} />
      <NewTokenDialog token={secret} handle={agent.handle} onClose={() => { setSecret(""); }} />
    </div>
  );
}
