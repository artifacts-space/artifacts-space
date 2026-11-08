import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { ArtifactRecord } from "@/db/schema";
import { artifactViewDay, artifactViewReferrer } from "@/db/views-schema";

import { buildViewStats, rangeStart, topReferrerCount, type ViewRange, type ViewStats } from "./view-stats-rules";
import { countsViews, viewDay } from "./view-rules";

/**
 * Reads an artifact's view counts. Callers must have checked that the reader
 * may edit the artifact (getEditableArtifact in src/lib/access.ts): only
 * its author and the team it is shared through see these numbers.
 */
export async function loadViewStats(record: Pick<ArtifactRecord, "id" | "visibility">, days: ViewRange, now: Date = new Date()): Promise<ViewStats> {
  const today = viewDay(now);
  const start = rangeStart(today, days);
  const db = getDb();
  const viewsSum = sql<number>`sum(${artifactViewReferrer.views})::int`;
  const [rows, referrers] = await Promise.all([
    db
      .select({ day: artifactViewDay.day, views: artifactViewDay.views, visitors: artifactViewDay.visitors })
      .from(artifactViewDay)
      .where(and(eq(artifactViewDay.artifactId, record.id), gte(artifactViewDay.day, start))),
    db
      .select({ domain: artifactViewReferrer.domain, views: viewsSum })
      .from(artifactViewReferrer)
      .where(and(eq(artifactViewReferrer.artifactId, record.id), gte(artifactViewReferrer.day, start)))
      .groupBy(artifactViewReferrer.domain)
      .orderBy(desc(viewsSum), artifactViewReferrer.domain)
      .limit(topReferrerCount),
  ]);
  return buildViewStats({ rows, referrers, today, days, counting: countsViews(record.visibility) });
}
