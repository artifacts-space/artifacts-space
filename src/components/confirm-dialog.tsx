"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useCallback, useState } from "react";

import { useConfirmations } from "@/components/confirmations-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmAndRun, requestConfirmation, type ConfirmedRun } from "@/lib/confirmations/flow";
import type { ConfirmationAction } from "@/lib/confirmations/kinds";

/** State and handlers that `useConfirm` hands to `ConfirmDialog`. */
export interface ConfirmDialogState {
  open: boolean;
  pending: boolean;
  canSkip: boolean;
  dontAskAgain: boolean;
  onDontAskAgainChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms one kind of destructive action. `request(run)` runs it at once when
 * the person chose "Don't ask again"; otherwise it opens the dialog. `run`
 * resolves true when the action finished, which closes the dialog.
 */
export function useConfirm(action: ConfirmationAction) {
  const { available, skipped, skip } = useConfirmations();
  const [current, setCurrent] = useState<{ run: ConfirmedRun } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [pending, setPending] = useState(false);

  const request = useCallback((run: ConfirmedRun) => {
    requestConfirmation(skipped, action, run, (next) => {
      setDontAskAgain(false);
      setCurrent({ run: next });
    });
  }, [skipped, action]);

  async function confirm() {
    if (!current) return;
    setPending(true);
    try {
      const done = await confirmAndRun({ action, dontAskAgain, run: current.run, skip });
      if (done) setCurrent(null);
    } finally {
      setPending(false);
    }
  }

  const dialog: ConfirmDialogState = {
    open: current !== null,
    pending,
    canSkip: available,
    dontAskAgain,
    onDontAskAgainChange: setDontAskAgain,
    onCancel: () => { setCurrent(null); },
    onConfirm: () => void confirm(),
  };
  return { request, dialog };
}

interface ConfirmDialogProps {
  state: ConfirmDialogState;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  /** Extra pending state from the caller, such as a shared action hook. */
  pending?: boolean;
  /** Destructive by default. Use "default" for an action that loses nothing, such as a restore. */
  confirmVariant?: "destructive" | "default";
}

/** The one confirmation dialog for destructive actions, with "Don't ask again". */
export function ConfirmDialog({ state, title, description, confirmLabel, pending = false, confirmVariant = "destructive" }: ConfirmDialogProps) {
  const busy = pending || state.pending;
  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) state.onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:items-center">
          {state.canSkip ? (
            <label className="flex items-center gap-2 py-1 text-sm text-muted-foreground max-sm:order-last sm:mr-auto">
              <Checkbox checked={state.dontAskAgain} onCheckedChange={(checked) => { state.onDontAskAgainChange(checked); }} />
              Don&apos;t ask again
            </label>
          ) : null}
          <Button variant="ghost" onClick={state.onCancel}>Cancel</Button>
          <Button variant={confirmVariant} onClick={state.onConfirm} disabled={busy}>
            {busy ? <IconLoader2 className="animate-spin" /> : null} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
