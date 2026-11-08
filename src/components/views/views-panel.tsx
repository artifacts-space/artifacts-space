"use client";

import { ChartView } from "@/components/artifact-view/ui/chart";
import { Button } from "@/components/ui/button";
import { dayLabel, viewRanges, type ViewRange, type ViewStats } from "@/lib/views/view-stats-rules";
import { cn } from "@/lib/utils";

const count = (value: number) => value.toLocaleString("en-US");
const ignoreEvents = () => undefined;

/** Shown when the artifact is not public, above any counts from when it was. */
export const notCountingNotice = "Views are counted while an artifact is public.";

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card-nested min-w-0 rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-[-0.02em] tabular-nums" data-stat={label}>{count(value)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The 30 and 90 day switch. */
export function RangeSwitch({ value, onChange, disabled }: { value: ViewRange; onChange: (range: ViewRange) => void; disabled: boolean }) {
  return (
    <div role="group" aria-label="Range" className="flex items-center gap-1">
      {viewRanges.map((range) => (
        <Button key={range} variant={range === value ? "secondary" : "ghost"} size="xs" aria-pressed={range === value} disabled={disabled} onClick={() => { onChange(range); }}>
          {range} days
        </Button>
      ))}
    </div>
  );
}

function DailyChart({ stats }: { stats: ViewStats }) {
  const labels = stats.daily.map((row) => dayLabel(row.day));
  const series = [
    { name: "Views", values: stats.daily.map((row) => row.views) },
    { name: "Visitors", values: stats.daily.map((row) => row.visitors) },
  ];
  return <ChartView props={{ type: "line", labels, series, title: "Views per day", height: "sm", xLabel: "Day (UTC)" }} emit={ignoreEvents} />;
}

/** Referring sites, each with a bar for its share of the top site's views. */
function Referrers({ referrers }: { referrers: ViewStats["referrers"] }) {
  const most = referrers[0]?.views ?? 0;
  return (
    <section aria-labelledby="views-referrers" className="space-y-2">
      <h3 id="views-referrers" className="text-md font-medium">Top sites</h3>
      {referrers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits from other sites yet. Links from search, chat, and other pages show up here by domain.</p>
      ) : (
        <ul className="divide-y">
          {referrers.map((row) => (
            <li key={row.domain} className="flex items-center gap-3 py-1.5 text-sm" data-referrer={row.domain}>
              <span className="min-w-0 flex-1 truncate" title={row.domain}>{row.domain}</span>
              <span aria-hidden className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-series-1" style={{ width: `${String(most > 0 ? Math.max(4, (row.views / most) * 100) : 0)}%` }} />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums">{count(row.views)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * An artifact's views for the people who can edit it: totals for the range,
 * views and visitors per day, and the sites readers came from. Counts only;
 * nothing here identifies a reader.
 */
export function ViewsPanel({ stats, className }: { stats: ViewStats; className?: string }) {
  const empty = stats.totals.views === 0;
  return (
    <div className={cn("space-y-6", className)}>
      {stats.counting ? null : <p role="note" className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{notCountingNotice}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Views" value={stats.totals.views} hint={`Last ${String(stats.days)} days`} />
        <Stat label="Visitors" value={stats.totals.visitors} hint="Each reader counts once a day" />
      </div>
      {empty ? (
        <p className="text-md text-muted-foreground">
          {stats.counting ? "No views in this range yet. A view shows up here a few seconds after someone opens the public page." : "No views in this range."}
        </p>
      ) : (
        <>
          <DailyChart stats={stats} />
          <Referrers referrers={stats.referrers} />
        </>
      )}
    </div>
  );
}
