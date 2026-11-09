import { z } from "zod";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";
import { getSession } from "@/lib/session";
import { memberTeamIcon, type MemberTeamIcon } from "@/lib/teams/team-icon";
import { teamIconCacheControl, teamIconRateLimitChecks } from "@/lib/teams/team-icon-rules";

/**
 * Headers on every answer. Team icons are team-only, so nothing here is
 * shared or indexed. Refusals and errors are never kept; an icon is kept
 * only by the member's own browser (teamIconCacheControl), never by a shared
 * cache or CDN.
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

/**
 * Counts the request against the member's own icon limit and the network's
 * backstop (signed out: the network only). Fails open, so a counter outage
 * never hides icons.
 */
async function overLimit(request: Request, userId: string | null) {
  try {
    return await hitRateLimits(teamIconRateLimitChecks(userId, networkKey(request.headers)));
  } catch (error) {
    console.error("[team-icon] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

function iconResponse(icon: MemberTeamIcon, requestedVersion: string | null) {
  const extension = icon.type === "image/webp" ? "webp" : "png";
  return new Response(icon.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Cache-Control": teamIconCacheControl(requestedVersion, icon.id),
      "Content-Type": icon.type,
      "Content-Length": String(icon.size),
      "Content-Disposition": `inline; filename="team-icon.${extension}"`,
    },
  });
}

/**
 * Shows a team's icon to signed-in members of that team. Everyone else
 * (signed out, not in the team, agents' tokens) and every team without an
 * icon gets the same 404, so the route never says whether a team or its
 * icon exists. The bytes stream from R2 (at most 1 MB, never held in
 * memory). When `v` names the current icon, the member's browser keeps it
 * for a day, so it is loaded about once a day, not on every page.
 */
export async function GET(request: Request, context: RouteContext<"/api/teams/[id]/icon">) {
  try {
    const session = await getSession();
    const refusal = await overLimit(request, session?.user.id ?? null);
    if (refusal) return tooManyRequests(refusal, baseHeaders);
    const teamId = teamIdSchema.safeParse((await context.params).id);
    if (!teamId.success || !session) return notFound();
    const icon = await memberTeamIcon(session.user.id, teamId.data);
    if (!icon) return notFound();
    return iconResponse(icon, new URL(request.url).searchParams.get("v"));
  } catch (error) {
    console.error("[team-icon] Loading the icon failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The icon could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
