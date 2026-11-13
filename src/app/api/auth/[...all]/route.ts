import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimit, hitRateLimits, rateLimitMessage } from "@/lib/abuse/rate-limit";
import { isMagicLinkRequest, magicLinkChecks, magicLinkEmail } from "@/lib/auth/magic-link-limits";
import { isPasswordSignInRequest } from "@/lib/auth/password-sign-in-limits";
import { handlePasswordSignIn } from "@/lib/auth/password-sign-in-route";
import { getAuth } from "@/lib/auth/server";
import { corsOAuthEndpoint, corsPreflightResponse, withCorsHeaders, withoutCookies } from "@/lib/oauth/cors-rules";
import { handleConsent, handleRegistration, isConsentDecision } from "@/lib/oauth/registration-limits";
import { authorizeRateLimit, oauthRateLimited, publicOAuthEndpoint, withPolicyScope } from "@/lib/oauth/request-policy";
import { handleTokenRequest } from "@/lib/oauth/token-limits";

/**
 * The per-network limit on authorization requests, which come from the
 * person's own browser. Registration and token requests have their own
 * limits (handleRegistration, handleTokenRequest). Returns a response to send
 * instead, or null to go on.
 */
async function refuseAbuse(request: Request): Promise<Response | null> {
  const decision = await hitRateLimit(authorizeRateLimit, networkKey(request.headers));
  return decision.allowed ? null : oauthRateLimited(authorizeRateLimit, decision.retryAfterSeconds);
}

/**
 * Limits sign-in link emails per network and per address, in Postgres.
 * Returns a 429 to send instead, or null to go on. Fails open, so sign-in
 * keeps working when the counters are unavailable.
 */
async function refuseMagicLinkFlood(request: Request): Promise<Response | null> {
  try {
    const body: unknown = await request.clone().json().catch(() => null);
    const refusal = await hitRateLimits(magicLinkChecks(networkKey(request.headers), magicLinkEmail(body)));
    if (!refusal) return null;
    return Response.json(
      { code: "RATE_LIMITED", message: rateLimitMessage(refusal.name, refusal.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(refusal.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[auth] Sign-in link limit check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/**
 * Applies the abuse limits, then rewrites an authorization request's scope to
 * this server's policy (no scope means full access, and offline_access is
 * always added so clients get refresh tokens).
 */
async function prepare(request: Request): Promise<Request | Response> {
  const url = new URL(request.url);
  if (isMagicLinkRequest(request.method, url.pathname)) return (await refuseMagicLinkFlood(request)) ?? request;
  if (publicOAuthEndpoint(request.method, url.pathname) !== "authorize") return request;
  try {
    const refusal = await refuseAbuse(request);
    if (refusal) return refusal;
  } catch (error) {
    // A limit check that fails open keeps sign-in working when the counters are unavailable.
    console.error("[oauth] Abuse check failed", error instanceof Error ? error.name : "unknown error");
  }
  return new Request(withPolicyScope(url), request);
}

async function handle(request: Request) {
  if (isPasswordSignInRequest(request.method, new URL(request.url).pathname)) return handlePasswordSignIn(request, (signIn) => getAuth().handler(signIn));
  const prepared = await prepare(request);
  if (prepared instanceof Response) return prepared;
  return getAuth().handler(prepared);
}

/**
 * The OAuth token and revoke endpoints answer any origin, without cookies
 * and never with credentials (src/lib/oauth/cors-rules.ts). Refusals carry
 * the CORS headers too, so a browser client can read why it was refused.
 */
async function handleCors(request: Request) {
  const bare = withoutCookies(request);
  const isToken = publicOAuthEndpoint(bare.method, new URL(bare.url).pathname) === "token";
  return withCorsHeaders(isToken ? await handleTokenRequest(bare, handle) : await handle(bare));
}

/** Better Auth endpoints: GitHub and Google sign-in, magic links, password sign-in for accounts given one, sessions, and the OAuth server for MCP clients. */
export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  const { pathname } = new URL(request.url);
  if (corsOAuthEndpoint(pathname)) return handleCors(request);
  if (isConsentDecision(pathname)) return handleConsent(request, handle);
  return publicOAuthEndpoint(request.method, pathname) === "register" ? handleRegistration(request, handle) : handle(request);
}

/** Preflight for the CORS-enabled OAuth endpoints. Every other path answers as Next does by default, with no CORS headers. */
export function OPTIONS(request: Request) {
  if (corsOAuthEndpoint(new URL(request.url).pathname)) return corsPreflightResponse();
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}
