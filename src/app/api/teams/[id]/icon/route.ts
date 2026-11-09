import { z } from "zod";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits, type RateLimitCheck } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";
import { getSession } from "@/lib/session";
import { memberTeamIcon, type MemberTeamIcon } from "@/lib/teams/team-icon";
import { teamIconCacheControl, teamIconMemberCheck, teamIconNetworkCheck } from "@/lib/teams/team-icon-rules";

/**
 * Headers on every answer. Team icons are team-only, so nothing here is
 * shared or indexed. Refusals and errors are never kept; an icon is kept
 * only by the member's own browser (teamIconCacheControl), never by a shared
 * cache or CDN. Trade-off, chosen on purpose for team branding: a browser
 * that showed an icon keeps it for up to a day, also after sign-out or
 * after leaving the team, under its unguessable `v` URL. Before, the
 * redirect was never kept and R2's answer was kept for five minutes.
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
 * Counts the request against one icon limit. Fails open, so a counter
 * outage never hides icons.
 */
async function overLimit(check: () => RateLimitCheck) {
  try {
    return await hitRateLimits([check()]);
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
 * icon exists. The network backstop is counted first, before any session
 * work; the member's own limit once the session is known. The bytes stream from R2 (at most 1 MB, never held in
 * memory). When `v` names the current icon, the member's browser keeps it
 * for a day, so it is loaded about once a day, not on every page.
 */
export async function GET(request: Request, context: RouteContext<"/api/teams/[id]/icon">) {
  try {
    const networkRefusal = await overLimit(() => teamIconNetworkCheck(networkKey(request.headers)));
    if (networkRefusal) return tooManyRequests(networkRefusal, baseHeaders);
    const teamId = teamIdSchema.safeParse((await context.params).id);
    if (!teamId.success) return notFound();
    const session = await getSession();
    if (!session) return notFound();
    const memberRefusal = await overLimit(() => teamIconMemberCheck(session.user.id));
    if (memberRefusal) return tooManyRequests(memberRefusal, baseHeaders);
    const icon = await memberTeamIcon(session.user.id, teamId.data);
    if (!icon) return notFound();
    return iconResponse(icon, new URL(request.url).searchParams.get("v"));
  } catch (error) {
    console.error("[team-icon] Loading the icon failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The icon could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
