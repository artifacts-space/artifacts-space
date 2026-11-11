"use client";

import { IconLoader2, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { leaveTeamAction, updateSharingRuleAction } from "@/app/(workspace)/teams/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

import { SharingRulePicker, sharingRuleFootnote } from "./sharing-rule-picker";
import { useTeamAction } from "./use-team-action";

/** The team's sharing rule. Everyone sees it; only owners change it. */
export function SharingRuleSetting({ teamId, needsApproval, canEdit }: { teamId: string; needsApproval: boolean; canEdit: boolean }) {
  const [value, setValue] = useState(needsApproval);
  const { pending, run } = useTeamAction();

  async function change(next: boolean) {
    if (next === value) return;
    setValue(next);
    const saved = await run("rule", () => updateSharingRuleAction(teamId, next), "Sharing rule saved.");
    if (!saved) setValue(!next);
  }

  return (
    <div className="space-y-3 p-5">
      <SharingRulePicker value={value} onChange={(next) => void change(next)} disabled={!canEdit || pending !== null} />
      <p className="text-sm leading-5 text-muted-foreground">
        {sharingRuleFootnote}
        {canEdit ? "" : " Only owners can change this rule."}
      </p>
    </div>
  );
}

/** Leave the team. Artifacts the viewer shared with it stay with the team; agents they added go to a team owner. */
export function LeaveTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const confirmLeave = useConfirm("leaveTeam");

  async function leave() {
    setPending(true);
    try {
      const result = await leaveTeamAction(teamId);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success("You left the team.");
      router.push("/teams");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => { confirmLeave.request(leave); }} className="text-xs">
        {pending ? <IconLoader2 className="animate-spin" /> : <IconLogout />} Leave team
      </Button>
      <ConfirmDialog
        state={confirmLeave.dialog}
        title={`Leave ${teamName}?`}
        description="Artifacts you shared with this team stay with the team, and its owners take them over. Agents you added go to the team's owner, and their tokens stop working at once. Your private artifacts stay yours."
        confirmLabel="Leave team"
        pending={pending}
      />
    </>
  );
}
