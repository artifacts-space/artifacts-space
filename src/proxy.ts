import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { canReadArtifact } from "@/lib/access";
import { getAuth } from "@/lib/auth/server";
import { markdownRequestFor, markdownRoutePath } from "@/lib/markdown/negotiation";
import { routeCheckFor, signInPath, type RouteCheck } from "@/lib/route-status";
import { isPageSearchIndexable } from "@/lib/search/search-queries";
import { noindexHeader, robotsHeaderName } from "@/lib/search/search-rules";
import { getTeamForMember } from "@/lib/teams/queries";

/**
 * Real HTTP statuses for workspace, artifact, comment thread, and team pages. With
 * Cache Components the page shell streams first, so a notFound() or redirect() in
 * the page can only send a 200. These checks run before the page renders:
 * signed-out workspace pages redirect to sign-in, and unknown or unreadable
 * artifacts and teams get a 404. The pages still run their own checks.
 *
 * Artifact pages, and their 404s, carry X-Robots-Tag: noindex, nofollow unless
 * search engines may index them (src/lib/search/search-rules.ts); the page's
 * robots meta tag says the same.
 *
 * Artifact pages also have a Markdown version for agents: /artifact/<id>.md,
 * or /artifact/<id> with Accept: text/markdown, is rewritten to the Markdown
 * route handler, which runs the access check and rate limits itself.
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

/** Tells search engines not to index or follow this response. */
function noindex<T extends Response>(response: T): T {
  response.headers.set(robotsHeaderName, noindexHeader);
  return response;
}

/** Whether search engines may index the page. A failed lookup counts as no. */
async function pageIndexable(publicId: string) {
  try {
    return await isPageSearchIndexable(publicId);
  } catch (error) {
    console.error("[proxy] Search visibility check failed", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}

/** The artifact page: 404 when the viewer cannot read it, noindex unless search engines may list it. */
async function checkArtifact(request: NextRequest, publicId: string) {
  const [readable, indexable] = await Promise.all([canReadArtifact(publicId, () => viewerId(request)), pageIndexable(publicId)]);
  if (!readable) return noindex(notFound(request));
  return indexable ? NextResponse.next() : noindex(NextResponse.next());
}

async function checkRecord(request: NextRequest, check: NonNullable<RouteCheck>) {
  if (check.kind === "workspace") return NextResponse.next();
  if (check.kind === "team") return checkTeam(request, check.slug);
  if (check.kind === "artifact") return checkArtifact(request, check.publicId);
  // Comment threads share the artifact read check.
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

/** Sends a Markdown request to the Markdown route handler, keeping the query (such as ?comments=1). */
function toMarkdown(request: NextRequest, publicId: string) {
  return NextResponse.rewrite(new URL(`${markdownRoutePath(publicId)}${request.nextUrl.search}`, request.url));
}

export async function proxy(request: NextRequest) {
  const markdown = markdownRequestFor(request.method, request.nextUrl.pathname, request.headers.get("accept"));
  if (markdown) return toMarkdown(request, markdown.publicId);
  const check = routeCheckFor(request.method, request.nextUrl.pathname);
  if (!check) return NextResponse.next();
  if (needsSignIn(request, check)) return toSignIn(request);
  const refusal = await refuseArtifactPageFlood(request, check);
  if (refusal) return refusal;
  try {
    return await checkRecord(request, check);
  } catch (error) {
    // The page repeats the check, so a failure here only costs the status code. Artifact pages stay noindex.
    console.error("[proxy] Route check failed", error instanceof Error ? error.name : "unknown error");
    return check.kind === "artifact" ? noindex(NextResponse.next()) : NextResponse.next();
  }
}

export const config = {
  matcher: ["/app/:path*", "/inbox", "/teams", "/teams/:slug", "/artifact/:publicId", "/threads/:publicId"],
};
