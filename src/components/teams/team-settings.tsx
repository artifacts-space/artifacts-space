"use client";

import { IconLoader2, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { leaveTeamAction, updateSharingRuleAction } from "@/app/(workspace)/teams/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { SharingRulePicker } from "./sharing-rule-picker";
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
      <p className="text-xs leading-5 text-muted-foreground">
        Link and public sharing always need an admin&apos;s approval in this team.
        {canEdit ? "" : " Only owners can change this rule."}
      </p>
    </div>
  );
}

/** Leave the team. Artifacts the viewer shared with it stay with the team. */
export function LeaveTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function leave() {
    setPending(true);
    try {
      const result = await leaveTeamAction(teamId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("You left the team.");
      router.push("/teams");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); }} className="text-xs">
        <IconLogout /> Leave team
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave {teamName}?</DialogTitle>
            <DialogDescription className="leading-6">
              Artifacts you shared with this team stay with the team, and its owners take them over. Your private artifacts stay yours.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); }}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void leave()}>
              {pending ? <IconLoader2 className="animate-spin" /> : null} Leave team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
