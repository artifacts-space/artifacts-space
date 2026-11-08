import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifactViewDay, artifactViewReferrer, artifactViewVisitor } from "@/db/views-schema";

import { maxReferrerDomainsPerDay } from "./view-rules";

/** One counted view, already checked by the rules in view-rules.ts. */
export interface CountedView {
  artifactId: string;
  /** The UTC date, YYYY-MM-DD. */
  day: string;
  /** The day's keyed visitor hash (visitorHash). */
  visitor: string;
  /** The referring domain, or null. */
  referrer: string | null;
}

/**
 * The one statement that records a view: it deletes visitor hashes from
 * earlier days (their key is gone, so they are useless and must not linger),
 * adds today's hash unless it is already there, adds the referrer domain
 * while the day has fewer than maxReferrerDomainsPerDay of them, and bumps
 * the day's views, and its visitors when the hash was new. One round trip,
 * and safe under concurrent beacons: the unique keys decide what is new.
 */
export function recordViewQuery(view: CountedView) {
  const day = sql`${view.day}::date`;
  const domain = sql`${view.referrer}::text`;
  return sql`
    with pruned as (
      delete from ${artifactViewVisitor} where ${artifactViewVisitor.day} < ${day}
    ),
    seen as (
      insert into ${artifactViewVisitor} (artifact_id, day, visitor) values (${view.artifactId}, ${day}, ${view.visitor})
      on conflict do nothing
      returning 1
    ),
    referred as (
      insert into ${artifactViewReferrer} (artifact_id, day, domain, views)
      select ${view.artifactId}, ${day}, ${domain}, 1
      where ${domain} is not null and (
        exists (select 1 from ${artifactViewReferrer} known where known.artifact_id = ${view.artifactId} and known.day = ${day} and known.domain = ${domain})
        or (select count(*) from ${artifactViewReferrer} known where known.artifact_id = ${view.artifactId} and known.day = ${day}) < ${maxReferrerDomainsPerDay}
      )
      on conflict (artifact_id, day, domain) do update set views = ${artifactViewReferrer}.views + 1
    )
    insert into ${artifactViewDay} (artifact_id, day, views, visitors)
    values (${view.artifactId}, ${day}, 1, (select count(*) from seen))
    on conflict (artifact_id, day) do update set
      views = ${artifactViewDay}.views + 1,
      visitors = ${artifactViewDay}.visitors + excluded.visitors
  `;
}

/** Records one counted view. Throws when the database cannot be reached; the beacon route swallows it. */
export async function recordView(view: CountedView): Promise<void> {
  await getDb().execute(recordViewQuery(view));
}
