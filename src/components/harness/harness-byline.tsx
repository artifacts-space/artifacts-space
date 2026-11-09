import type { ArtifactHarnessDto } from "@/lib/artifact-types";
import { harnessPhrase, type HarnessId } from "@/lib/harness/harnesses";
import { cn } from "@/lib/utils";

import { HarnessIcon } from "./harness-icon";

/** The words for a harness in a byline: "via Claude Code". */
export function viaHarness(id: HarnessId): string {
  return `via ${harnessPhrase(id)}`;
}

/** A harness id, or an artifact's harness, or nothing. */
type HarnessValue = HarnessId | ArtifactHarnessDto | null | undefined;

function idOf(value: HarnessValue): HarnessId | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** What the byline's tooltip says: the agent's app names itself, and nobody verifies it. */
const SELF_REPORTED = "The agent's app reports its own name. It is not verified.";

/** "via Claude Code" with the harness's icon, for an artifact's byline. Nothing when no agent made it. */
export function HarnessByline({ harness, className }: { harness: HarnessValue; className?: string }) {
  const id = idOf(harness);
  if (!id) return null;
  return (
    <span data-harness={id} title={SELF_REPORTED} className={cn("inline-flex min-w-0 items-center gap-1.5 text-muted-foreground", className)}>
      <HarnessIcon id={id} />
      <span className="truncate">via <span className="font-medium text-foreground">{harnessPhrase(id)}</span></span>
    </span>
  );
}

/** Just the icon, named for screen readers: for list cards, where space is short. */
export function HarnessMark({ harness, className }: { harness: HarnessValue; className?: string }) {
  const id = idOf(harness);
  if (!id) return null;
  const label = `Made with ${harnessPhrase(id)}`;
  return (
    <span role="img" aria-label={label} title={label} data-harness={id} className={cn("inline-flex shrink-0 items-center text-muted-foreground", className)}>
      <HarnessIcon id={id} />
    </span>
  );
}
