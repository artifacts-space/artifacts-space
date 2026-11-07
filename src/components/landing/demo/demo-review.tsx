import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { visibilityOptions } from "@/components/app/share-options";
import { PixelAvatar } from "@/components/pixel-avatar";
import { agentAsk, demoPeople, reviewerReply, T } from "@/lib/landing/demo-story";
import { cn } from "@/lib/utils";

import { beat } from "./beat";

/** A radio dot that fills at `on` and, when `off` is given, empties again. */
function Radio({ on, off }: { on?: number; off?: number }) {
  const filled = on === undefined ? beat(0, off) : beat(on, off);
  return (
    <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input">
      {on === undefined && off === undefined ? null : <span className="size-2 rounded-full bg-foreground" style={filled} />}
    </span>
  );
}

function radioTiming(value: string): { on?: number; off?: number } | null {
  if (value === "private") return { off: T.sharePick };
  if (value === "team") return { on: T.sharePick };
  return null;
}

/**
 * The share dialog as the agent's request applies: the choice moves from
 * Private to Team, the team is Acme, and the dialog closes.
 */
export function DemoShareDialog() {
  return (
    <div className="demo-dialog absolute top-14 right-4 z-10 w-72 max-w-[calc(100%-2rem)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg" style={beat(T.share + 0.2, T.shared + 0.4)}>
      <p className="text-base font-medium">Share</p>
      <ul className="mt-3 grid gap-2.5">
        {visibilityOptions.map((option) => {
          const timing = radioTiming(option.value);
          return (
            <li key={option.value} className="flex gap-2.5">
              <Radio {...(timing ?? {})} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex h-8 items-center justify-between rounded-md border px-2.5 text-sm" style={beat(T.sharePick)}>
        {demoPeople.team.name}
        <IconChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" style={beat(T.shared)}>
        <PixelAvatar seed={demoPeople.agent.seed} kind="agent" size={16} />
        @{demoPeople.agent.handle} shared it with {demoPeople.team.name}.
      </p>
    </div>
  );
}

function Mention({ handle, agent = false }: { handle: string; agent?: boolean }) {
  return (
    <span className={cn("rounded-sm px-1 font-medium", agent ? "bg-mention-agent text-mention-agent-foreground" : "bg-mention text-mention-foreground")}>
      @{handle}
    </span>
  );
}

function Comment({ seed, kind, author, children }: { seed: string; kind: "person" | "agent"; author: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <PixelAvatar seed={seed} kind={kind} size={20} />
        <span className="font-medium">{author}</span>
        {kind === "agent" ? <span className="rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">Agent</span> : null}
        <span className="text-xs text-muted-foreground">now</span>
      </div>
      <p className="text-sm leading-6">{children}</p>
    </div>
  );
}

/** The comment thread: the agent asks Dana, Dana types, and her reply lands. */
export function DemoComments({ className, heading = true }: { className?: string; heading?: boolean }) {
  const { agent, reviewer } = demoPeople;
  return (
    <div className={cn("card-nested flex min-w-0 flex-col gap-3 bg-card p-4 text-card-foreground", className)} style={beat(T.notified)}>
      {heading ? <p className="text-sm font-medium">Comments <span className="text-muted-foreground">2</span></p> : null}
      <Comment seed={agent.seed} kind="agent" author={`@${agent.handle}`}>
        <Mention handle={reviewer.handle} /> {agentAsk}
      </Comment>
      <div className="demo-swap">
        <p className="flex items-center gap-2 self-start text-xs text-muted-foreground" style={beat(T.typing, T.reply)}>
          <span className="demo-typing" aria-hidden="true"><i /><i /><i /></span>
          {reviewer.name} is typing
        </p>
        <div className="border-l pl-3" style={beat(T.reply)}>
          <Comment seed={reviewer.seed} kind="person" author={`@${reviewer.handle}`}>
            <Mention handle={agent.handle} agent /> {reviewerReply}
          </Comment>
        </div>
      </div>
    </div>
  );
}

/**
 * The thread on narrow screens, where the page has no room beside it: it
 * slides up over the bottom of the artifact as the mention lands, shows
 * Dana's reply, and leaves once the terminal is in front again. It is
 * hidden in the finished state, where version 2 shows what she asked for.
 */
export function DemoCommentSheet() {
  return (
    <div className="demo-sheet absolute inset-x-0 bottom-0 z-10 p-2 sm:left-auto sm:w-92 xl:hidden" style={beat(T.notified, T.termFront + 0.8)}>
      <DemoComments heading={false} className="gap-2.5 p-3.5 shadow-lg" />
    </div>
  );
}
