"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import { resetConfirmationsAction, skipConfirmationAction } from "@/lib/confirmations/actions";
import { saveSkip } from "@/lib/confirmations/flow";
import type { ConfirmationAction } from "@/lib/confirmations/kinds";

interface ConfirmationsValue {
  /** False outside the workspace, where choices cannot be saved. */
  available: boolean;
  skipped: ReadonlySet<ConfirmationAction>;
  skip: (action: ConfirmationAction) => void;
  reset: () => Promise<void>;
}

const noSkips: ReadonlySet<ConfirmationAction> = new Set();

const ConfirmationsContext = createContext<ConfirmationsValue>({
  available: false,
  skipped: noSkips,
  skip: () => undefined,
  reset: () => Promise.resolve(),
});

/** The confirmations this person turned off, and ways to change them. */
export function useConfirmations() {
  return useContext(ConfirmationsContext);
}

/**
 * Holds the person's skipped confirmations, loaded once by the workspace
 * layout. Changes show at once and save in the background.
 */
export function ConfirmationsProvider({ initial, children }: { initial: ConfirmationAction[]; children: React.ReactNode }) {
  const serverKey = [...initial].sort().join(",");
  const [state, setState] = useState(() => ({ serverKey, skipped: new Set(initial) }));
  // A refresh can bring newer choices from another device; take them.
  if (state.serverKey !== serverKey) setState({ serverKey, skipped: new Set(initial) });

  const update = useCallback((change: (next: Set<ConfirmationAction>) => void) => {
    setState((current) => {
      const next = new Set(current.skipped);
      change(next);
      return { ...current, skipped: next };
    });
  }, []);

  const skip = useCallback((action: ConfirmationAction) => {
    void saveSkip({
      action,
      add: (value) => { update((next) => next.add(value)); },
      remove: (value) => { update((next) => next.delete(value)); },
      save: skipConfirmationAction,
      onError: () => toast.error("Could not save “Don't ask again”. You will see this confirmation next time."),
    });
  }, [update]);

  const skipped = state.skipped;
  const reset = useCallback(async () => {
    const previous = skipped;
    setState((current) => ({ ...current, skipped: new Set() }));
    try {
      const result = await resetConfirmationsAction();
      if (result.success) {
        toast.success("Confirmations are back on.");
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    }
    setState((current) => ({ ...current, skipped: new Set(previous) }));
  }, [skipped]);

  const value = useMemo(() => ({ available: true, skipped, skip, reset }), [skipped, skip, reset]);
  return <ConfirmationsContext value={value}>{children}</ConfirmationsContext>;
}
