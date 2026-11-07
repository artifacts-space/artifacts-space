import Image from "next/image";
import { IconLock, IconShare3, IconUsers } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";

import { UiView } from "@/components/artifact-view/ui-view";
import { PixelAvatar } from "@/components/pixel-avatar";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { demoPieceContent, type DemoPiece } from "@/lib/landing/demo-artifact";
import { demoListRows, demoPeople, demoSummary, demoTitle, T } from "@/lib/landing/demo-story";
import { cn } from "@/lib/utils";

import { beat } from "./beat";
import { DemoComments, DemoShareDialog } from "./demo-review";

const UiIcon = kindIcons.ui;

/** The app header: logo, workspace navigation, and who is looking at the artifact. */
function AppHeader() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-4 border-b px-3 sm:px-4">
      <Image src="/artifacts-space-mark.svg" alt="" width={27} height={20} className="h-5 w-[27px] shrink-0" />
      <nav className="flex h-full items-center gap-3 text-sm text-muted-foreground sm:gap-4">
        <span className="relative flex h-full items-center text-foreground">
          Artifacts
          <span className="absolute inset-x-0 bottom-0 h-px bg-foreground" />
        </span>
        <span>Teams</span>
        <span>Inbox</span>
      </nav>
      <div className="ml-auto flex items-center">
        <span className="demo-presence" style={beat(T.notified)}>
          <PixelAvatar seed={demoPeople.reviewer.seed} size={24} className="rounded-full ring-2 ring-background" />
        </span>
        <PixelAvatar seed={demoPeople.owner.seed} size={24} className="-ml-1.5 rounded-full ring-2 ring-background" />
      </div>
    </div>
  );
}

function ListRow({ title, kind, meta, visibility, style, fresh = false }: { title: string; kind: keyof typeof kindIcons; meta: string; visibility: string; style?: CSSProperties; fresh?: boolean }) {
  const Icon = kindIcons[kind];
  return (
    <li className={cn("relative isolate flex items-center gap-3 rounded-sm px-3 py-2.5", fresh && "demo-row-new bg-muted")} style={style}>
      {fresh ? <span className="demo-glow" style={beat(T.created)} /> : null}
      <Icon aria-hidden className={cn("size-4 shrink-0", kindColors[kind])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{visibility}</span>
    </li>
  );
}

/** The artifact list, where the new artifact lands before it opens. */
function ListScene() {
  return (
    <div className="demo-scene p-3 sm:p-4" style={beat(0, T.open)}>
      <h3 className="px-3 text-lg font-medium tracking-[-0.01em]">Artifacts</h3>
      <p className="px-3 text-sm text-muted-foreground">Newest first</p>
      <ul className="mt-3 grid gap-0.5">
        <ListRow title={demoTitle} kind="ui" meta={`${demoPeople.project} · now`} visibility="Private" style={beat(T.created)} fresh />
        {demoListRows.map((row) => <ListRow key={row.title} {...row} />)}
      </ul>
    </div>
  );
}

/** Two states of one spot: the first leaves as the second lands. */
function Swap({ at, before, after, className }: { at: number; before: ReactNode; after: ReactNode; className?: string }) {
  return (
    <span className={cn("demo-swap", className)}>
      <span style={beat(0, at)}>{before}</span>
      <span style={beat(at)}>{after}</span>
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap">{children}</span>;
}

/** One piece of the page, drawn by the app's own renderer, in both versions when it changes. */
function Piece({ piece, at, changes = false, className }: { piece: DemoPiece; at: number; changes?: boolean; className?: string }) {
  return (
    <div className={cn("demo-piece relative isolate min-w-0", className)} style={beat(at)}>
      {changes ? (
        <div className="demo-swap">
          <div style={beat(0, T.updated)}><UiView content={demoPieceContent(piece, 1)} /></div>
          <div style={beat(T.updated)}><UiView content={demoPieceContent(piece, 2)} /></div>
          <span className="demo-glow" style={beat(T.updated)} />
        </div>
      ) : (
        <UiView content={demoPieceContent(piece, 1)} />
      )}
    </div>
  );
}

/** The artifact page: header, share state, version, and the pieces as they build in. */
function ArtifactScene() {
  return (
    <div className="demo-scene flex flex-col gap-5 p-4 sm:p-5" style={beat(T.open)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Artifacts / {demoPeople.project}</p>
          <h3 className="mt-1 text-xl font-medium tracking-[-0.02em]">{demoTitle}</h3>
          <p className="mt-1 text-md text-muted-foreground">{demoSummary}</p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium">
          <IconShare3 aria-hidden className="size-4" /> Share
        </span>
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Chip><UiIcon aria-hidden className={cn("size-3.5", kindColors.ui)} /> ui</Chip>
        <Swap
          at={T.shared}
          before={<Chip><IconLock aria-hidden className="size-3.5" /> Private</Chip>}
          after={<Chip><IconUsers aria-hidden className="size-3.5" /> Team · {demoPeople.team.name}</Chip>}
        />
        <Swap at={T.updated} before={<Chip>Version 1</Chip>} after={<Chip>Version 2</Chip>} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <PixelAvatar seed={demoPeople.agent.seed} kind="agent" size={18} /> @{demoPeople.agent.handle}
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Piece piece="chart" at={T.chart} changes />
        <Piece piece="timeline" at={T.timeline} changes />
      </div>
      <Piece piece="board" at={T.board} className="max-sm:hidden" />
    </div>
  );
}

/**
 * The artifacts.space app as the demo shows it: a different surface from the
 * terminal, drawn in the theme opposite to the page (`theme-invert` in
 * globals.css), with real components and tokens.
 */
export function DemoApp() {
  return (
    <div className="demo-app theme-invert flex min-w-0 flex-col bg-background text-foreground">
      <AppHeader />
      <div className="demo-app__stage relative flex-1" data-demo-pane="">
        <ListScene />
        <ArtifactScene />
        <DemoShareDialog />
        <DemoComments />
      </div>
    </div>
  );
}
