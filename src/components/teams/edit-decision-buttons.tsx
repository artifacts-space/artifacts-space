"use client";

import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";

import { decideSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { Button } from "@/components/ui/button";

import { useTeamAction } from "./use-team-action";

/** Approve makes the edit what every reader sees; deny keeps the approved version live. */
export function EditDecisionButtons({ requestId }: { requestId: string }) {
  const { pending, run } = useTeamAction();
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" className="text-xs" disabled={pending !== null} onClick={() => void run("approve", () => decideSharingAction(requestId, true), "Edit approved. Every reader sees it now.")}>
        {pending === "approve" ? <IconLoader2 className="animate-spin" /> : <IconCheck />} Approve
      </Button>
      <Button size="sm" variant="ghost" className="text-xs" disabled={pending !== null} onClick={() => void run("deny", () => decideSharingAction(requestId, false), "Edit denied. Readers keep the approved version.")}>
        {pending === "deny" ? <IconLoader2 className="animate-spin" /> : <IconX />} Deny
      </Button>
    </div>
  );
}
