import { NextResponse, type NextRequest } from "next/server";

import { canReadArtifact } from "@/lib/access";
import { getAuth } from "@/lib/auth/server";
import { routeCheckFor, signInPath } from "@/lib/route-status";
import { getTeamForMember } from "@/lib/teams/queries";

/**
 * Real HTTP statuses for artifact and team pages. With Cache Components the
 * page shell streams first, so a notFound() in the page can only send a 200
 * with a not-found body. These checks run before the page renders: unknown
 * or unreadable artifacts and teams get a 404, and signed-out team pages
 * redirect to sign-in. The pages still run their own access checks.
 */

async function viewerId(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function notFound(request: NextRequest) {
  // No route matches this path, so Next renders the not-found page with a 404 status.
  return NextResponse.rewrite(new URL("/_not-found-response", request.url), { status: 404 });
}

async function checkTeam(request: NextRequest, slug: string) {
  const userId = await viewerId(request);
  if (!userId) return NextResponse.redirect(new URL(signInPath(request.nextUrl.pathname), request.url));
  return (await getTeamForMember(userId, slug)) ? NextResponse.next() : notFound(request);
}

export async function proxy(request: NextRequest) {
  const check = routeCheckFor(request.method, request.nextUrl.pathname);
  if (!check) return NextResponse.next();
  try {
    if (check.kind === "team") return await checkTeam(request, check.slug);
    return (await canReadArtifact(check.publicId, () => viewerId(request))) ? NextResponse.next() : notFound(request);
  } catch (error) {
    // The page repeats the check, so a failure here only costs the status code.
    console.error("[proxy] Route check failed", error instanceof Error ? error.name : "unknown error");
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/artifact/:publicId", "/teams/:slug"],
};
