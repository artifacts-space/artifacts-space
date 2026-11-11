"use client";

import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { acceptInvitationAction, declineInvitationAction } from "@/app/invitations/actions";
import { Button } from "@/components/ui/button";
import { teamWorkspacePath } from "@/lib/teams/invitation-rules";

/** How long the welcome stays up: long enough to read three short sentences. */
const WELCOME_MS = 15_000;

/** Accept or decline one invitation. Accepting opens the team's workspace with a short welcome. */
export function InvitationButtons({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  async function accept() {
    setPending("accept");
    try {
      const result = await acceptInvitationAction(invitationId);
      if (!result.success) {
        toast.error(result.error);
        setPending(null);
        return;
      }
      // The toaster lives in the root layout, so the welcome stays up while the team's workspace loads.
      toast.success(result.data.welcome.title, { description: result.data.welcome.description, duration: WELCOME_MS, closeButton: true });
      // Stays pending while the workspace opens, so a second click cannot send the invitation again.
      router.push(teamWorkspacePath(result.data.slug));
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
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
