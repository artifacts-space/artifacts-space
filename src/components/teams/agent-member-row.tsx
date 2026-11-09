"use client";

import { IconKey, IconTrash, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { useState } from "react";

import { removeAgentAction, setAgentMuteAction } from "@/app/(workspace)/teams/agent-actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { TeamAgentView } from "@/lib/agents/queries";
import { agentRemovalDescription } from "@/lib/agents/rules";

import { AgentTokensDialog } from "./agent-tokens-dialog";
import { cell } from "./member-table-cells";
import { NameCell, RowMenu } from "./member-table-parts";
import { useTeamAction } from "./use-team-action";

/**
 * The confirm kind and text for removing an agent. Removal that deletes
 * artifacts asks under its own kind, so "Don't ask again" for plain removals
 * never skips that warning.
 */
function removalConfirm(agent: TeamAgentView) {
  const keeperName = agent.ownerInTeam ? agent.ownerName ?? "the person who added it" : null;
  const deletesArtifacts = agent.ownArtifacts > 0 && keeperName === null;
  return {
    kind: deletesArtifacts ? ("removeAgentWithArtifacts" as const) : ("removeAgent" as const),
    description: agentRemovalDescription({ ownArtifacts: agent.ownArtifacts, keeperName }),
  };
}

/** The agent's status. Token states show only to owners and admins, who are the ones who can fix them. */
function agentStatus(agent: TeamAgentView, canManage: boolean): string {
  if (agent.muted) return "Muted";
  if (canManage && agent.handedOver) return "Needs a new token";
  if (canManage && agent.tokens.length === 0) return "Needs a token";
  return "Active";
}

function AgentMenu({ agent, origin }: { agent: TeamAgentView; origin: string }) {
  const { pending, run } = useTeamAction();
  const [tokensOpen, setTokensOpen] = useState(false);
  const removal = removalConfirm(agent);
  const confirmRemove = useConfirm(removal.kind);
  const mute = () => run("mute", () => setAgentMuteAction(agent.userId, !agent.muted), agent.muted ? `@${agent.handle} can post again.` : `@${agent.handle} is muted across the team.`);
  return (
    <>
      <RowMenu label={`Actions for @${agent.handle}`} disabled={pending !== null}>
        <DropdownMenuItem onClick={() => { setTokensOpen(true); }}><IconKey aria-hidden /> Tokens</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void mute()}>
          {agent.muted ? <IconVolume aria-hidden /> : <IconVolumeOff aria-hidden />} {agent.muted ? "Unmute" : "Mute"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => { confirmRemove.request(() => run("remove", () => removeAgentAction(agent.userId), `@${agent.handle} removed.`)); }}>
          <IconTrash aria-hidden /> Remove agent
        </DropdownMenuItem>
      </RowMenu>
      <AgentTokensDialog agent={agent} origin={origin} open={tokensOpen} onOpenChange={setTokensOpen} />
      <ConfirmDialog state={confirmRemove.dialog} title={`Remove @${agent.handle}?`} description={removal.description} confirmLabel="Remove" pending={pending === "remove"} />
    </>
  );
}

/**
 * One agent teammate in the Members table, with an Agent badge and who added
 * it. Owners and admins get its ⋯ menu: tokens, mute, and remove. `origin`
 * fills in the MCP setup shown with a new token.
 */
export function AgentMemberRow({ agent, canManage, origin }: { agent: TeamAgentView; canManage: boolean; origin: string }) {
  const addedBy = agent.ownerName ?? "A former member";
  const status = agentStatus(agent, canManage);
  return (
    <tr className="border-t" data-member-row="agent">
      <NameCell
        avatar={<PixelAvatar seed={agent.userId} kind="agent" size={24} />}
        name={agent.name}
        badge={<Badge variant="secondary">Agent</Badge>}
        detail={`@${agent.handle}`}
        phoneNote={status === "Active" ? `Added by ${addedBy}` : `${status} · Added by ${addedBy}`}
      />
      <td className={cell.middle}>Agent</td>
      <td className={`${cell.wide} whitespace-nowrap`}>{addedBy}</td>
      <td className={`${cell.wide} whitespace-nowrap text-muted-foreground`}>{status}</td>
      <td className={cell.last}>{canManage ? <AgentMenu agent={agent} origin={origin} /> : null}</td>
    </tr>
  );
}
