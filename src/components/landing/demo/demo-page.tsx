import { IconArrowsMaximize, IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

import {
  holdDays,
  planCopy,
  planStats,
  planSteps,
  rampDays,
  rampPath,
  trendPoints,
  type PlanStat,
  type PlanStep,
  type PlanVersion,
} from "@/lib/landing/demo-artifact";
import { T } from "@/lib/landing/demo-story";
import { cn } from "@/lib/utils";

import { beat } from "./beat";

/**
 * Both versions of one part of the page in the same spot: version 1 leaves
 * and version 2 lands as the agent saves it, with a glow. The spot keeps
 * the size of the taller one, so nothing moves around it.
 */
function Versions({ render }: { render: (version: PlanVersion) => ReactNode }) {
  return (
    <div className="demo-swap">
      <div style={beat(0, T.v2)}>{render(1)}</div>
      <div style={beat(T.v2)}>{render(2)}</div>
      <span className="demo-glow" style={beat(T.v2)} />
    </div>
  );
}

/** One part of the page, landing at its beat, named for the layout checks (`data-demo-card`). */
function Piece({ at, name, className, children }: { at: number; name: string; className?: string; children: ReactNode }) {
  return (
    <div data-demo-card={name} className={cn("demo-piece relative isolate min-w-0", className)} style={beat(at)}>
      {children}
    </div>
  );
}

/** The page's own top bar: a site mark, its name, and whether the rollout is live, as the agent wrote it. */
function SiteBar() {
  return (
    <div className="flex items-center gap-2.5 border-b pb-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">A</span>
      <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em]">Acme checkout</span>
      <span className="ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-tone-success/10 px-2.5 text-xs font-medium text-tone-success">
        <i className="size-1.5 rounded-full bg-tone-success" /> Live at 5%
      </span>
    </div>
  );
}

function Headline({ version }: { version: PlanVersion }) {
  const copy = planCopy[version];
  return (
    <div className="grid gap-1">
      <p className="text-lg leading-6 font-semibold tracking-[-0.02em] text-balance @min-[30rem]/page:text-xl @min-[30rem]/page:leading-7">{copy.title}</p>
      <p className="text-sm text-muted-foreground max-sm:hidden">{copy.lede}</p>
    </div>
  );
}

/** The page's headline and lede, in both versions of the plan. */
function PageHeader() {
  return (
    <div data-demo-card="header" className="relative isolate">
      <Versions render={(version) => <Headline version={version} />} />
    </div>
  );
}

function Sparkline({ trend }: { trend: readonly number[] }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-5 w-full overflow-visible">
      <polyline points={trendPoints(trend)} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: "var(--series-1)", strokeWidth: 1.5, strokeLinejoin: "round" }} />
    </svg>
  );
}

function Stat({ stat }: { stat: PlanStat }) {
  return (
    <div className="card-nested grid min-w-0 gap-1 bg-card p-2 sm:p-2.5">
      <span className="truncate text-xs text-muted-foreground">{stat.label}</span>
      <span className={cn("text-lg leading-6 font-semibold tracking-[-0.02em] tabular-nums", stat.good === true && "text-tone-success")}>{stat.value}</span>
      <span className="truncate text-xs text-muted-foreground max-xl:hidden">{stat.detail}</span>
      <span className="max-sm:hidden"><Sparkline trend={stat.trend} /></span>
    </div>
  );
}

/** The live numbers: share of traffic on v2, errors, and conversion, each with its trend. */
function Stats() {
  return (
    <Piece at={T.stats} name="stats" className="grid grid-cols-3 gap-2 @min-[30rem]/page:gap-3">
      {planStats.map((stat) => <Stat key={stat.label} stat={stat} />)}
    </Piece>
  );
}

const dayWidth = 100 / rampDays.length;

/** The traffic plot of one version: a step line over its filled area, and in version 2 the weekend hold. */
function RampPlot({ version }: { version: PlanVersion }) {
  return (
    <div className="relative h-20 sm:h-24">
      {[0, 50, 100].map((level) => (
        <span key={level} className="absolute inset-x-0 border-t border-dashed" style={{ top: `${String(100 - level)}%` }} />
      ))}
      {version === 2 ? (
        <span
          className="absolute inset-y-0 flex items-start justify-center rounded-sm bg-tone-warning/10 pt-1 text-xs font-medium text-tone-warning"
          style={{ left: `${String(holdDays.first * dayWidth)}%`, width: `${String((holdDays.last - holdDays.first + 1) * dayWidth)}%` }}
        >
          Hold
        </span>
      ) : null}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={rampPath(version, true)} style={{ fill: "var(--series-1)", fillOpacity: 0.14 }} />
        <path d={rampPath(version)} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: "var(--series-1)", strokeWidth: 2, strokeLinejoin: "round" }} />
      </svg>
    </div>
  );
}

/** The traffic chart: share of checkout on v2 for each day of the week, with its scale and days. */
function RampChart() {
  return (
    <Piece at={T.chart} name="chart" className="card-nested bg-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Traffic on v2</span>
        <span className="text-xs text-muted-foreground">This week</span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="flex flex-col justify-between text-right text-xs leading-none text-muted-foreground tabular-nums">
          <span className="-mt-1.5">100%</span>
          <span>50%</span>
          <span className="-mb-1.5">0</span>
        </div>
        <Versions render={(version) => <RampPlot version={version} />} />
        <div className="col-start-2 mt-1.5 grid grid-cols-7 text-center text-xs text-muted-foreground">
          {rampDays.map((day, index) => <span key={day} className={cn(index === 0 && "font-medium text-foreground")}>{day}</span>)}
        </div>
      </div>
    </Piece>
  );
}

const stepMarks: Record<PlanStep["status"], string> = {
  done: "border-tone-success bg-tone-success text-background",
  current: "border-tone-info bg-card",
  upcoming: "border-input bg-card",
};

function StepRow({ step }: { step: PlanStep }) {
  return (
    <li className="relative grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-2.5 pb-2.5 last:pb-0">
      <span className={cn("relative z-10 mt-0.5 flex size-4 items-center justify-center rounded-full border-2", stepMarks[step.status])}>
        {step.status === "done" ? <IconCheck aria-hidden className="size-2.5" stroke={3} /> : null}
        {step.status === "current" ? <i className="size-1.5 rounded-full bg-tone-info" /> : null}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm", step.status === "current" && "font-medium")}>{step.title}</span>
        {step.note === undefined ? null : <span className="block text-xs text-muted-foreground">{step.note}</span>}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{step.time}</span>
    </li>
  );
}

function StepList({ version }: { version: PlanVersion }) {
  return (
    <ol className="demo-steps mt-2.5 grid">
      {planSteps[version].map((step) => <StepRow key={step.title} step={step} />)}
    </ol>
  );
}

/** The rollout steps, done, current, and to come. */
function Steps() {
  return (
    <Piece at={T.steps} name="steps" className="card-nested bg-card p-3 @max-[34rem]/page:hidden">
      <span className="text-sm font-medium">Steps</span>
      <Versions render={(version) => <StepList version={version} />} />
    </Piece>
  );
}

/**
 * The web page the agent saved, as the artifact page shows it: the page's
 * box with its full screen button, and the page inside. On the real page it
 * runs in the sandbox; the landing draws the same page as plain JSX with the
 * site's tokens, so the hero stays static and follows the theme. It sizes
 * its parts by its own width (the `page` container): the steps sit beside
 * the chart when the page is wide enough, and are left out when it is not,
 * so the page always ends on whole cards.
 */
export function DemoPage() {
  return (
    <div data-demo-window="" data-demo-card="page window" className="@container/page flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex h-8 shrink-0 items-center justify-end border-b px-2.5 text-muted-foreground max-sm:hidden">
        <IconArrowsMaximize aria-hidden className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 p-3.5 sm:gap-3 sm:p-4">
        <SiteBar />
        <PageHeader />
        <Stats />
        <div className="grid gap-3 @min-[34rem]/page:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <RampChart />
          <Steps />
        </div>
      </div>
    </div>
  );
}
