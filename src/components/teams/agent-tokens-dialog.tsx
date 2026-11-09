"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TeamAgentView } from "@/lib/agents/queries";

import { AgentTokens } from "./agent-tokens";

/** For owners and admins: the agent was handed over when the person who added it left, and needs a new token. */
function HandedOverNote({ agent }: { agent: TeamAgentView }) {
  if (!agent.handedOver) return null;
  const keeper = agent.ownerName ?? "the team's owners";
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {`The person who added @${agent.handle} left the team, so it was handed to ${keeper} and its tokens were turned off. Create a new token to reconnect it.`}
    </p>
  );
}

/** An agent's tokens in a dialog, opened from its row's menu. People who may add and remove agents only. */
export function AgentTokensDialog({ agent, origin, open, onOpenChange }: { agent: TeamAgentView; origin: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tokens for @{agent.handle}</DialogTitle>
          <DialogDescription>A token connects an MCP client as this agent. It sees only what the team can see.</DialogDescription>
        </DialogHeader>
        <HandedOverNote agent={agent} />
        <AgentTokens agent={agent} origin={origin} />
      </DialogContent>
    </Dialog>
  );
}
