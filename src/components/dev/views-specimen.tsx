"use client";

import { ViewsDialog, type LoadViewStats } from "@/components/views/views-dialog";
import { buildViewStats, rangeDays, type ViewRange } from "@/lib/views/view-stats-rules";

const today = "2026-11-08";

/** A steady weekly rhythm, so the 90-day total differs from the 30-day one. */
function fixtureRows(days: ViewRange) {
  return rangeDays(today, days).map((day, index) => ({ day, views: 10 + (index % 7) * 3, visitors: 6 + (index % 7) }));
}

const referrers = [
  { domain: "news.ycombinator.com", views: 120 },
  { domain: "github.com", views: 48 },
  { domain: "x.com", views: 12 },
];

const publicStats: LoadViewStats = (_publicId, days) => Promise.resolve({ success: true, data: buildViewStats({ rows: fixtureRows(days), referrers, today, days, counting: true }) });
const privateStats: LoadViewStats = (_publicId, days) => Promise.resolve({ success: true, data: buildViewStats({ rows: [], referrers: [], today, days, counting: false }) });

/** The Views dialog with fixture numbers, a public artifact and a private one, for the gallery and its e2e test. */
export function ViewsSpecimen() {
  return (
    <div className="flex flex-wrap gap-6">
      <div data-views-fixture="public" className="flex items-center gap-2 text-sm text-muted-foreground">
        Public artifact <ViewsDialog publicId="fixtureviewspublic0000" title="Launch plan" load={publicStats} />
      </div>
      <div data-views-fixture="private" className="flex items-center gap-2 text-sm text-muted-foreground">
        Private artifact <ViewsDialog publicId="fixtureviewsprivate000" title="Draft notes" load={privateStats} />
      </div>
    </div>
  );
}
