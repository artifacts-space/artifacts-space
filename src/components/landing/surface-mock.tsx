import { IconSquare, IconSquareCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PixelIcon } from "./pixel-icon";
import { ActorBadge } from "./section-marks";

export type SurfaceRegion = "plan" | "comments" | "history";

/** The pinned number on a region; the callout with the same number explains it. */
function Pin({ number }: { number: number }) {
  return (
    <span aria-hidden className="surface-pin absolute right-3 top-3 grid size-5 place-items-center rounded-[2px] border bg-card font-mono text-xs text-muted-foreground">
      {number}
    </span>
  );
}

/** One explorable part of the window. Hovering it, or its callout, highlights it (surface.css). */
function Region({ id, number, className, children }: { id: SurfaceRegion; number: number; className?: string; children: ReactNode }) {
  return (
    <div data-region={id} className={cn("surface-region relative", className)}>
      <Pin number={number} />
      {children}
    </div>
  );
}

const checklist = [
  { done: true, text: "Sign tokens with a rotating key" },
  { done: true, text: "Read sessions and JWTs side by side behind a flag" },
  { done: false, text: "Turn the flag on at 5%, then 100%" },
] as const;

const files = [
  { path: "src/auth/jwt.ts", added: 84, removed: 0 },
  { path: "src/auth/session.ts", added: 0, removed: 31 },
  { path: "src/proxy.ts", added: 12, removed: 4 },
] as const;

/** Region 1: the plan itself, with headings, a checklist, and the files it touches. */
function PlanBody() {
  return (
    <Region id="plan" number={1} className="p-6 sm:p-8">
      <p className="pr-8 text-xl font-medium tracking-[-0.015em]">Auth migration plan</p>
      <p className="mt-2 max-w-[520px] text-md leading-6 text-muted-foreground">Move sign-in from server sessions to signed JWTs. Nobody gets signed out.</p>
      <p className="mt-6 text-sm font-medium">Steps</p>
      <ul className="mt-2 grid gap-1.5 text-md">
        {checklist.map((item) => (
          <li key={item.text} className="flex items-start gap-2">
            {item.done ? <IconSquareCheck aria-hidden className="mt-1 size-4 shrink-0" /> : <IconSquare aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />}
            <span className={item.done ? "" : "text-muted-foreground"}>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm font-medium">Files</p>
      <ul className="mt-2 grid max-w-[420px] gap-1 font-mono text-xs">
        {files.map((file) => (
          <li key={file.path} className="flex justify-between gap-4">
            <span className="truncate">{file.path}</span>
            <span className="shrink-0">
              {file.added > 0 ? <span className="text-tone-success">+{file.added}</span> : null}
              {file.added > 0 && file.removed > 0 ? " " : null}
              {file.removed > 0 ? <span className="text-tone-danger">−{file.removed}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Region>
  );
}

/** Region 2: a person corrects the agent in a comment; the agent answers with a new version. */
function CommentRail() {
  return (
    <Region id="comments" number={2} className="border-t p-5 lg:border-l lg:border-t-0">
      <p className="text-xs text-muted-foreground">Comments</p>
      <div className="mt-4 grid gap-5 text-md">
        <div className="flex gap-2.5">
          <ActorBadge kind="person" initials="DA" />
          <div className="min-w-0">
            <p className="text-sm"><span className="font-medium">Dana</span> <span className="text-muted-foreground">· Nov 2</span></p>
            <p className="mt-1 leading-6"><span className="text-actor-agent">@agent</span> skip the session table, use JWTs.</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <ActorBadge kind="agent" />
          <div className="min-w-0">
            <p className="text-sm"><span className="font-medium">Claude Code</span> <span className="text-muted-foreground">· Nov 2</span></p>
            <p className="mt-1 leading-6">
              Updated · <span className="rounded-[2px] bg-actor-agent-tint px-1.5 py-0.5 font-mono text-xs text-actor-agent">v3 saved</span>
            </p>
          </div>
        </div>
      </div>
    </Region>
  );
}

const versions = [
  { label: "v1", note: "First draft", date: "Oct 30", actor: "agent" },
  { label: "v2", note: "Added rollback steps", date: "Nov 1", actor: "person" },
  { label: "v3", note: "Chose JWT over sessions", date: "Nov 2", actor: "agent" },
  { label: "v4", note: "Hold at 5% over the weekend", date: "Nov 4", actor: "person" },
] as const;

/** Region 3: the version scrubber, one decision note per save, colored by who saved it. */
function VersionScrubber() {
  return (
    <Region id="history" number={3} className="border-t px-6 py-5 sm:px-8">
      <p className="text-xs text-muted-foreground">History</p>
      <ol className="relative mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <span aria-hidden className="absolute inset-x-0 top-[5px] hidden h-px bg-border sm:block" />
        {versions.map((version, index) => (
          <li key={version.label} className="relative min-w-0">
            <span className={cn("block size-2.5 rounded-full ring-4 ring-card", version.actor === "agent" ? "bg-actor-agent" : "bg-actor-person", index === versions.length - 1 && "outline outline-offset-2 outline-foreground")} />
            <p className="mt-3 font-mono text-xs">{version.label}</p>
            <p className="mt-0.5 text-sm leading-5">{version.note}</p>
            <p className="text-xs text-muted-foreground">{version.date}</p>
          </li>
        ))}
      </ol>
    </Region>
  );
}

/**
 * The artifact window: an address bar, the plan beside its comments, and the
 * history along the bottom. A picture of the product, so it is hidden from
 * screen readers; the numbered callouts beside it say what each part does.
 */
export function SurfaceMock() {
  return (
    <div aria-hidden className="frame-sharp overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex gap-1.5">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono">
          <PixelIcon name="plan" size={16} />
          <span className="truncate">artifacts.space/a/auth-plan</span>
        </span>
        <span className="ml-auto font-mono">v4</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <PlanBody />
        <CommentRail />
      </div>
      <VersionScrubber />
    </div>
  );
}
