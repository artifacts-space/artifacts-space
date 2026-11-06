import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { canReadArtifact } from "@/lib/access";
import { getAuth } from "@/lib/auth/server";
import { routeCheckFor, signInPath, type RouteCheck } from "@/lib/route-status";
import { getTeamForMember } from "@/lib/teams/queries";

/**
 * Real HTTP statuses for workspace, artifact, comment thread, and team pages. With
 * Cache Components the page shell streams first, so a notFound() or redirect() in
 * the page can only send a 200. These checks run before the page renders:
 * signed-out workspace pages redirect to sign-in, and unknown or unreadable
 * artifacts and teams get a 404. The pages still run their own checks.
 */

async function viewerId(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function notFound(request: NextRequest) {
  // No route matches this path, so Next renders the not-found page with a 404 status.
  return NextResponse.rewrite(new URL("/_not-found-response", request.url), { status: 404 });
}

function toSignIn(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(signInPath(`${pathname}${search}`), request.url));
}

/**
 * Workspace pages (comment threads included) need a session. Only the cookie is
 * checked here, which costs no database call; the workspace layout checks the
 * session itself and still redirects when the cookie is stale.
 */
function needsSignIn(request: NextRequest, check: NonNullable<RouteCheck>) {
  if (check.kind !== "workspace" && check.kind !== "thread") return false;
  return !getSessionCookie(request);
}

async function checkTeam(request: NextRequest, slug: string) {
  const userId = await viewerId(request);
  if (!userId) return toSignIn(request);
  return (await getTeamForMember(userId, slug)) ? NextResponse.next() : notFound(request);
}

async function checkRecord(request: NextRequest, check: NonNullable<RouteCheck>) {
  if (check.kind === "workspace") return NextResponse.next();
  if (check.kind === "team") return checkTeam(request, check.slug);
  // Artifact pages and their comment threads share the artifact read check.
  return (await canReadArtifact(check.publicId, () => viewerId(request))) ? NextResponse.next() : notFound(request);
}

/**
 * Artifact pages are open to anyone with the link, so they are limited per
 * network address. Returns a 429 to send, or null. Fails open.
 */
async function refuseArtifactPageFlood(request: NextRequest, check: NonNullable<RouteCheck>) {
  if (check.kind !== "artifact") return null;
  try {
    const refusal = await hitRateLimits([{ name: "artifactPageByNetwork", subject: networkKey(request.headers) }]);
    return refusal ? tooManyRequests(refusal) : null;
  } catch (error) {
    console.error("[proxy] Rate limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const check = routeCheckFor(request.method, request.nextUrl.pathname);
  if (!check) return NextResponse.next();
  if (needsSignIn(request, check)) return toSignIn(request);
  const refusal = await refuseArtifactPageFlood(request, check);
  if (refusal) return refusal;
  try {
    return await checkRecord(request, check);
  } catch (error) {
    // The page repeats the check, so a failure here only costs the status code.
    console.error("[proxy] Route check failed", error instanceof Error ? error.name : "unknown error");
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/app/:path*", "/inbox", "/teams", "/teams/:slug", "/artifact/:publicId", "/threads/:publicId"],
};
