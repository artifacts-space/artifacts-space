"use client";

import { toast } from "sonner";

import { setConnectionHarnessAction, type ConnectionTarget } from "@/app/(workspace)/app/harness-actions";
import type { ConnectionHarnessDto } from "@/lib/harness/connection-store";
import { harnessFor, type HarnessId } from "@/lib/harness/harnesses";

import { HarnessSelect } from "./harness-select";

/** Saves a connection's harness through the server action. Swappable for the gallery, which has no database. */
export type SaveConnectionHarness = (target: ConnectionTarget, harness: HarnessId | null) => ReturnType<typeof setConnectionHarnessAction>;

interface ConnectionHarnessProps {
  target: ConnectionTarget;
  harness: ConnectionHarnessDto;
  /** The connection's name, for the select's accessible name. */
  name: string;
  save?: SaveConnectionHarness | undefined;
  /** Called with the choice once it is saved, so the row's icon can follow. */
  onSaved?: ((override: HarnessId | null) => void) | undefined;
}

/**
 * "Agent" on a connection: what it was detected as, with the client's own
 * name for an unknown one, and a select to change it for later saves.
 */
export function ConnectionHarness({ target, harness, name, save, onSaved }: ConnectionHarnessProps) {
  async function change(next: HarnessId | null) {
    const result = await (save ?? setConnectionHarnessAction)(target, next);
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    onSaved?.(next);
    toast.success(next ? `Saves from ${name} now show ${harnessFor(next).name}.` : `Saves from ${name} now show what was detected.`);
    return true;
  }

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-xs text-muted-foreground">Agent</span>
      <HarnessSelect detected={harness.detected} override={harness.override} label={`Agent for ${name}`} onChange={change} />
      {harness.detectedLabel ? <span className="min-w-0 truncate text-xs text-muted-foreground" title={harness.detectedLabel}>Calls itself “{harness.detectedLabel}”</span> : null}
    </div>
  );
}
