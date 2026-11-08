import { clientAddress, networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { getArtifactAccess } from "@/lib/access";
import { getSession } from "@/lib/session";

import { recordView } from "./record-view";
import { daySalt, isBotUserAgent, isCrossSiteBeacon, maxBeaconLength, parseViewBeacon, referrerDomain, viewDay, viewDecision, viewHashSecret, visitorHash, type ViewBeacon } from "./view-rules";

/**
 * The server side of the view beacon (POST /api/views). Every outcome is
 * silent: the page never learns whether a view counted, whether the artifact
 * exists, or whether it is public, so the beacon cannot be used as an oracle.
 */

/** What happened to one beacon, for tests and logs. Never sent to the page. */
export type BeaconOutcome = "counted" | "ignored" | "limited";

async function readBeacon(request: Request): Promise<ViewBeacon | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBeaconLength) return null;
  const body = await request.text().catch(() => "");
  return parseViewBeacon(body);
}

/** The signed-in reader, by session cookie only (beacons carry no token). */
async function readerId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/** Per network across all artifacts, and per network on one artifact, so one address cannot inflate a page. */
function limitChecks(request: Request, publicId: string) {
  const network = networkKey(request.headers);
  return [
    { name: "viewByNetwork" as const, subject: network },
    { name: "viewByNetworkArtifact" as const, subject: `${network}:${publicId}` },
  ];
}

/**
 * Checks one beacon and records the view when it counts: a same-site
 * request from a browser that is not a bot, with a valid body, for an
 * artifact whose views are counted, from a reader who cannot edit it, within
 * the per-network limits. Throws only when a store cannot be reached.
 */
export async function handleViewBeacon(request: Request, now: Date = new Date()): Promise<BeaconOutcome> {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isCrossSiteBeacon(request.headers) || isBotUserAgent(userAgent)) return "ignored";
  const beacon = await readBeacon(request);
  const secret = viewHashSecret();
  if (!beacon || !secret) return "ignored";
  if (await hitRateLimits(limitChecks(request, beacon.id))) return "limited";

  const access = await getArtifactAccess(beacon.id, await readerId());
  if (!access) return "ignored";
  const decision = viewDecision({ visibility: access.record.visibility, canEdit: access.canEdit, bot: false });
  if (decision !== "count") return "ignored";

  const day = viewDay(now);
  const artifactId = access.record.id;
  const visitor = visitorHash({ salt: daySalt(secret, day), address: clientAddress(request.headers), userAgent, artifactId });
  await recordView({ artifactId, day, visitor, referrer: referrerDomain(beacon.referrer) });
  return "counted";
}
