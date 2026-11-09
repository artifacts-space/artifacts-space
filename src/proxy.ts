import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { canReadArtifact } from "@/lib/access";
import { checkArtifactPage } from "@/lib/artifact-page-check";
import { authPageDecisionFor, entryDecisionFor, entryPageFor, workspaceDecisionFor, type EntryPage } from "@/lib/auth/entry-rules";
import { applySessionDecision, noStore, proxySession } from "@/lib/auth/proxy-session";
import { getAuth } from "@/lib/auth/server";
import { markdownRequestFor, markdownRoutePath } from "@/lib/markdown/negotiation";
import { routeCheckFor, signInPath, type RouteCheck } from "@/lib/route-status";
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
 *
 * Signed-in visitors skip the landing page and the sign-in pages and go to
 * the workspace (src/lib/auth/entry-rules.ts). Those pages stay static: the
 * proxy runs on them only when a session cookie is present (see `config`).
 */

async function viewerId(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function notFound(request: NextRequest) {
  // No route matches this path, so Next renders the not-found page with a 404 status.
  return NextResponse.rewrite(new URL("/_not-found-response", request.url), { status: 404 });
}

function signInUrl(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return signInPath(`${pathname}${search}`);
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

function toSignIn(request: NextRequest) {
  return noStore(redirectTo(request, signInUrl(request)));
}

/**
 * Workspace pages (comment threads included) need a session. A missing cookie
 * redirects to sign-in here with no lookup at all.
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

/**
 * The artifact page: 404 when the viewer cannot read it, noindex unless search
 * engines may list it. Both answers come from one query (checkArtifactPage);
 * when it fails, proxy() sends the page on with noindex.
 */
async function checkArtifact(request: NextRequest, publicId: string) {
  const { readable, indexable } = await checkArtifactPage(publicId, () => viewerId(request));
  if (!readable) return noindex(notFound(request));
  return indexable ? NextResponse.next() : noindex(NextResponse.next());
}

/**
 * The real session check for workspace pages. A stale cookie (the session
 * expired or was revoked) is expired on the way to sign-in, so `/` stops
 * sending the visitor back here. A live session passes, with any refreshed
 * session cookies from Better Auth: this is how a session that is in use
 * keeps its cookie for the full session lifetime.
 */
async function checkWorkspace(request: NextRequest) {
  const session = await proxySession(request);
  const decision = workspaceDecisionFor(session.signedIn, signInUrl(request));
  return applySessionDecision(request, decision, session, () => NextResponse.next(), (to) => redirectTo(request, to));
}

async function checkRecord(request: NextRequest, check: NonNullable<RouteCheck>) {
  if (check.kind === "workspace") return checkWorkspace(request);
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

/** The sign-in pages ask for the real session, so a stale cookie never bounces anyone back to the workspace. */
async function checkAuthPage(request: NextRequest) {
  try {
    const session = await proxySession(request);
    const decision = authPageDecisionFor(session.signedIn, request.nextUrl.searchParams.get("next"));
    return applySessionDecision(request, decision, session, () => NextResponse.next(), (to) => redirectTo(request, to));
  } catch (error) {
    // Show the sign-in page; signing in again replaces whatever cookie is there.
    console.error("[proxy] Session check failed", error instanceof Error ? error.name : "unknown error");
    return noStore(NextResponse.next());
  }
}

/** The landing page and the sign-in pages, when a session cookie is present. */
function checkEntryPage(request: NextRequest, page: NonNullable<EntryPage>) {
  const decision = entryDecisionFor(page, Boolean(getSessionCookie(request)), request.nextUrl.searchParams);
  if (decision.action === "check-session") return checkAuthPage(request);
  if (decision.action === "redirect") return noStore(redirectTo(request, decision.to));
  // The static page itself, unchanged and still cacheable for everyone else.
  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const entry = entryPageFor(request.method, request.nextUrl.pathname);
  if (entry) return checkEntryPage(request, entry);
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

/*
 * The landing and sign-in pages are static. The proxy runs on them only when
 * a Better Auth session cookie is present (`__Secure-` on HTTPS), so crawlers
 * and signed-out visitors get the CDN copy with no proxy call at all.
 * Matcher values must be literals, so the cookie names are spelled out.
 */
export const config = {
  matcher: [
    "/app/:path*",
    "/inbox",
    "/teams",
    "/teams/:slug",
    "/artifact/:publicId",
    "/threads/:publicId",
    { source: "/", has: [{ type: "cookie", key: "__Secure-better-auth.session_token" }] },
    { source: "/", has: [{ type: "cookie", key: "better-auth.session_token" }] },
    { source: "/sign-in", has: [{ type: "cookie", key: "__Secure-better-auth.session_token" }] },
    { source: "/sign-in", has: [{ type: "cookie", key: "better-auth.session_token" }] },
    { source: "/sign-up", has: [{ type: "cookie", key: "__Secure-better-auth.session_token" }] },
    { source: "/sign-up", has: [{ type: "cookie", key: "better-auth.session_token" }] },
  ],
};
