import { z } from "zod";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";
import { getSession } from "@/lib/session";
import { signedTeamIconUrl } from "@/lib/teams/team-icon";

/**
 * Headers on every answer. Team icons are team-only, so nothing here is
 * shared, indexed, or kept: like /api/files, the redirect is never cached,
 * so after sign-out a shared browser cannot follow it again. R2's answer is
 * cached privately for five minutes (presignDownload), so repeat views cost
 * one redirect, not a new download.
 */
const baseHeaders = {
  "Cache-Control": "private, no-store",
  [robotsHeaderName]: noindexHeader,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const teamIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

function notFound() {
  return new Response("Not found", { status: 404, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

/** The per-network limit on icon views, apart from file views. Fails open, so a counter outage never hides icons. */
async function overLimit(request: Request) {
  try {
    return await hitRateLimits([{ name: "teamIconByNetwork", subject: networkKey(request.headers) }]);
  } catch (error) {
    console.error("[team-icon] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/**
 * Shows a team's icon to signed-in members of that team with a 302 to a
 * short-lived R2 link. Everyone else (signed out, not in the team, agents'
 * tokens) and every team without an icon gets the same 404, so the route
 * never says whether a team or its icon exists.
 */
export async function GET(request: Request, context: RouteContext<"/api/teams/[id]/icon">) {
  const refusal = await overLimit(request);
  if (refusal) return tooManyRequests(refusal, baseHeaders);
  try {
    const { id } = await context.params;
    const teamId = teamIdSchema.safeParse(id);
    if (!teamId.success) return notFound();
    const session = await getSession();
    if (!session) return notFound();
    const url = await signedTeamIconUrl(session.user.id, teamId.data);
    if (!url) return notFound();
    return new Response(null, { status: 302, headers: { ...baseHeaders, Location: url } });
  } catch (error) {
    console.error("[team-icon] Loading the icon failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The icon could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
