"use client";

import { IconLoader2, IconSwitchHorizontal } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { forgetThisBrowser } from "@/components/notifications/push/forget-this-browser";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { withNextPath } from "@/lib/safe-next";

/**
 * Signs out and opens sign-in, which comes back to `returnTo` afterwards: the
 * way out when an invitation went to an address this account does not use.
 */
export function SwitchAccountButton({ returnTo, label }: { returnTo: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchAccount() {
    setPending(true);
    try {
      // A shared computer should not keep showing this account's notifications.
      await forgetThisBrowser();
      await authClient.signOut();
      router.push(withNextPath("/sign-in", returnTo));
      router.refresh();
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <Button size="sm" disabled={pending} onClick={() => void switchAccount()}>
      {pending ? <IconLoader2 className="animate-spin" /> : <IconSwitchHorizontal />} {label}
    </Button>
  );
}
