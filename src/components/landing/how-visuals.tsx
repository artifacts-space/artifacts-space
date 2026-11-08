import { IconCheck } from "@tabler/icons-react";

import { SKILL_INSTALL_COMMAND } from "@/lib/setup/install-command";
import { cn } from "@/lib/utils";

import { PixelIcon } from "./pixel-icon";
import { ActorBadge } from "./section-marks";

/** The artifact link the agent hands back, as a chip. The plan glyph is the artifact that travels the line. */
export function ArtifactChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[2px] bg-actor-agent-tint px-1.5 py-0.5 font-mono text-xs text-actor-agent", className)}>
      <PixelIcon name="plan" size={16} />
      artifacts.space/a/auth-plan
    </span>
  );
}

/** Step 1: the install command types itself, then the skill answers. */
export function InstallTerminal() {
  return (
    <div className="frame-sharp overflow-hidden font-mono text-xs leading-6">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-muted-foreground">
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="ml-2">~/acme-app</span>
      </div>
      <div className="px-3 py-3">
        <p className="flex whitespace-nowrap">
          <span className="mr-2 text-muted-foreground">$</span>
          <span className="how-type inline-block">{SKILL_INSTALL_COMMAND}</span>
        </p>
        <p className="how-out mt-1 flex items-start gap-1.5 text-actor-agent">
          <IconCheck aria-hidden className="mt-1 size-3.5 shrink-0" />
          <span>skill installed · agent will save to artifacts.space</span>
        </p>
      </div>
    </div>
  );
}

/** Step 2: you ask in plain words; the agent answers with a link to the saved artifact. */
export function AskChat() {
  return (
    <div className="frame-sharp grid gap-4 p-4 text-sm">
      <div className="how-ask-1 flex items-start gap-2.5">
        <ActorBadge kind="person" initials="CK" />
        <p className="pt-0.5">plan the auth migration</p>
      </div>
      <div className="how-ask-2 flex items-start gap-2.5">
        <ActorBadge kind="agent" />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-actor-agent">
          Saved <span aria-hidden>→</span> <ArtifactChip />
        </p>
      </div>
    </div>
  );
}

/** A grey bar standing in for a line of text in a mockup. */
function TextLine({ width }: { width: string }) {
  return <span className="block h-1.5 rounded-[1px] bg-muted-foreground/20" style={{ width }} />;
}

/** Step 3: the chip opens into the artifact, with two people, one agent, a live cursor, and a comment. */
export function CollabPreview() {
  return (
    <div className="how-collab frame-sharp relative p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <PixelIcon name="plan" size={16} />
          <span className="truncate">Auth migration plan</span>
        </span>
        <span className="flex -space-x-1.5">
          <ActorBadge kind="person" initials="CK" />
          <ActorBadge kind="person" initials="DA" />
          <ActorBadge kind="agent" />
        </span>
      </div>
      <div className="mt-4 grid gap-2.5">
        <TextLine width="92%" />
        <span className="flex items-center gap-2">
          <TextLine width="64%" />
          <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full bg-actor-person">
            <span className="size-1.5 rounded-full bg-card" />
          </span>
        </span>
        <TextLine width="80%" />
        <TextLine width="48%" />
      </div>
      <span aria-hidden className="how-cursor pointer-events-none absolute bottom-3 right-10 flex items-start">
        <svg width="12" height="14" viewBox="0 0 12 14" className="fill-actor-person">
          <path d="M0 0l12 8-5 1-3 5z" />
        </svg>
        <span className="mt-2 rounded-[2px] bg-actor-person px-1.5 text-xs leading-5 text-card">Dana</span>
      </span>
    </div>
  );
}
