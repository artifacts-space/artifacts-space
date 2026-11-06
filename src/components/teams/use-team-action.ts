import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/artifact-types";

/**
 * Runs a team server action with one pending key at a time, shows the result
 * as a toast, and refreshes the page's server data on success.
 */
export function useTeamAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function run<T>(key: string, action: () => Promise<ActionResult<T>>, success: string) {
    setPending(key);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  return { pending, run };
}
