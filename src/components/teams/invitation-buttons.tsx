"use client";

import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { acceptInvitationAction, declineInvitationAction } from "@/app/invitations/actions";
import { Button } from "@/components/ui/button";

/** Accept or decline one invitation. Accepting opens the team. */
export function InvitationButtons({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  async function accept() {
    setPending("accept");
    try {
      const result = await acceptInvitationAction(invitationId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("You joined the team.");
      router.push(`/teams/${result.data.slug}`);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function decline() {
    setPending("decline");
    try {
      const result = await declineInvitationAction(invitationId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation declined.");
      router.push("/teams");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending !== null} onClick={() => void accept()}>
        {pending === "accept" ? <IconLoader2 className="animate-spin" /> : <IconCheck />} Join team
      </Button>
      <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void decline()}>
        {pending === "decline" ? <IconLoader2 className="animate-spin" /> : null} Decline
      </Button>
    </div>
  );
}
