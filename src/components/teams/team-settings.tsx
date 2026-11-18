"use client";

import { IconLoader2, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateSharingRuleAction } from "@/app/(workspace)/teams/actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { leaveConfirmKind, type LeavePreview } from "@/lib/teams/departure-rules";

import { LeaveChoiceDialog } from "./leave-choice-dialog";
import { useLeaveActions } from "./leave-actions";
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

/**
 * Leave the team. It first asks what stays behind (leavePreviewAction): with
 * none of the viewer's artifacts in the team, the plain confirm, which "Don't
 * ask again" may skip; with some, the choice dialog (LeaveChoiceDialog),
 * which always shows. Agents they added go to a team owner.
 */
export function LeaveTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter();
  const actions = useLeaveActions();
  const [checking, setChecking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [choice, setChoice] = useState<LeavePreview | null>(null);
  const confirmLeave = useConfirm("leaveTeam");

  async function leave() {
    setLeaving(true);
    try {
      const result = await actions.leave(teamId);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setChoice(null);
      toast.success("You left the team.");
      router.push("/teams");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setLeaving(false);
    }
  }

  async function start() {
    setChecking(true);
    try {
      const result = await actions.preview(teamId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (leaveConfirmKind(result.data.total) === "choice") setChoice(result.data);
      else confirmLeave.request(leave);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  const busy = checking || leaving;
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void start()} className="text-xs">
        {busy ? <IconLoader2 className="animate-spin" /> : <IconLogout />} Leave team
      </Button>
      <ConfirmDialog
        state={confirmLeave.dialog}
        title={`Leave ${teamName}?`}
        description="None of your artifacts live in this team, so nothing of yours stays behind. Agents you added go to the team's owner, and their tokens stop working at once. Your private artifacts stay yours."
        confirmLabel="Leave team"
        pending={leaving}
      />
      {choice ? (
        <LeaveChoiceDialog
          open
          teamName={teamName}
          preview={choice}
          onPreview={setChoice}
          move={(ids) => actions.moveToPersonal(teamId, ids)}
          onCancel={() => { setChoice(null); }}
          onLeave={() => void leave()}
          leaving={leaving}
        />
      ) : null}
    </>
  );
}
