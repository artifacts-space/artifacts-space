import { createHmac } from "node:crypto";

import { userAgentFromString } from "next/server";
import { z } from "zod";

import type { ArtifactVisibility } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";

/**
 * The rules for cookieless view counting. A public artifact page sends one
 * beacon after it loads; the server counts it unless the reader is a bot or
 * may edit the artifact. Each day, a visitor is a keyed hash of the network
 * address, user agent, and artifact, with a key that changes every day, so
 * nobody can be followed from one day to the next. Pure functions; storage
 * lives in record-view.ts.
 */

/**
 * Visibilities whose views are counted. Link artifacts are not counted: their
 * readers were handed a private URL, and counting them tells the author when
 * a particular recipient opened it. Add "link" here to count them too.
 */
const countedVisibilities: ReadonlySet<ArtifactVisibility> = new Set(["public"]);

/** Whether views of an artifact with this visibility are counted. */
export function countsViews(visibility: ArtifactVisibility): boolean {
  return countedVisibilities.has(visibility);
}

/** Why a beacon is counted or not. */
export type ViewDecision = "count" | "not-counted-visibility" | "editor" | "bot";

/**
 * Whether one page view counts: the artifact's visibility is counted, the
 * reader is not a bot, and the reader cannot edit the artifact (its author
 * and the team it is shared through read it while they work on it).
 */
export function viewDecision(input: { visibility: ArtifactVisibility; canEdit: boolean; bot: boolean }): ViewDecision {
  if (!countsViews(input.visibility)) return "not-counted-visibility";
  if (input.bot) return "bot";
  if (input.canEdit) return "editor";
  return "count";
}

/** Crawlers, link unfurlers, monitors, HTTP libraries, and automated browsers. */
const botPattern =
  /bot\b|bot\/|crawl|spider|slurp|scrape|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|okhttp|node-fetch|undici|axios|httpclient|libwww|phantomjs|selenium|puppeteer|playwright|facebookexternalhit|embedly|vercel/i;

/** Longest user agent a real browser sends, with room to spare. Longer ones are treated as bots. */
const maxUserAgentLength = 512;

/**
 * Whether the user agent belongs to a bot: empty, implausibly long, a known
 * crawler (Next.js's own list), or one of the patterns above.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim() ?? "";
  if (!value || value.length > maxUserAgentLength) return true;
  if (userAgentFromString(value).isBot) return true;
  return botPattern.test(value);
}

/**
 * The beacon came from another site. Browsers send Sec-Fetch-Site with every
 * request; a beacon from our own page says "same-origin". Requests without
 * the header (old browsers, scripts) are judged by the other rules and the
 * rate limits.
 */
export function isCrossSiteBeacon(headers: Pick<Headers, "get">): boolean {
  const site = headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin";
}

/** Largest beacon body accepted, in characters. */
export const maxBeaconLength = 4096;

/** What the page sends: the artifact's public id, and document.referrer (reduced to a domain on the server). */
export const viewBeaconSchema = z.object({
  id: z.string().refine(isPublicId),
  referrer: z.string().max(2048).optional(),
});

export type ViewBeacon = z.infer<typeof viewBeaconSchema>;

/** Parses a beacon body, or null when it is not a valid beacon. Never throws. */
export function parseViewBeacon(body: string): ViewBeacon | null {
  if (!body || body.length > maxBeaconLength) return null;
  try {
    const parsed = viewBeaconSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The referring site's domain, without "www.", or null for none. Only the
 * domain is ever kept: a full URL could be another capability URL or carry
 * personal data.
 */
export function referrerDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host.length > 253) return null;
  return host;
}

/**
 * Referrer domains kept per artifact per day. Views from further domains
 * still count, without a domain. A soft cap: beacons in the same instant can
 * pass it by a few, and the rate limits bound the rest.
 */
export const maxReferrerDomainsPerDay = 50;

/** The UTC date, YYYY-MM-DD, that a view at `now` counts toward. */
export function viewDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The hashing key for one day, derived from the server secret and the date.
 * The derivation is one-way, so a day's key reveals nothing about the secret
 * or any other day's key, and every visitor hash from an earlier day is
 * deleted on the next write (record-view.ts).
 */
export function daySalt(secret: string, day: string): string {
  return createHmac("sha256", secret).update(`artifact-views:v1:${day}`).digest("hex");
}

/**
 * One visitor of one artifact on one day: a keyed hash of the network
 * address, user agent, and artifact id. Neither the address nor the user
 * agent is stored. The artifact id is in the hash so one person's hashes on
 * two artifacts cannot be matched.
 */
export function visitorHash(input: { salt: string; address: string; userAgent: string; artifactId: string }): string {
  return createHmac("sha256", input.salt).update(`${input.artifactId}\n${input.address}\n${input.userAgent}`).digest("hex").slice(0, 32);
}

/**
 * The secret visitor hashes are keyed with, read on each use (never at import
 * time, so the build needs none). Null when it is missing or blank: an
 * unkeyed hash of an address can be reversed by hashing every address, so
 * nothing is counted then.
 */
export function viewHashSecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  return secret ? secret : null;
}
