import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimit, hitRateLimits, rateLimitMessage } from "@/lib/abuse/rate-limit";
import { rateLimitMessages } from "@/lib/abuse/limits";
import { describeWait } from "@/lib/abuse/rate-limit-window";
import { isMagicLinkRequest, magicLinkChecks, magicLinkEmail } from "@/lib/auth/magic-link-limits";
import { isPasswordSignInRequest } from "@/lib/auth/password-sign-in-limits";
import { handlePasswordSignIn } from "@/lib/auth/password-sign-in-route";
import { getAuth } from "@/lib/auth/server";
import { countUnapprovedClients } from "@/lib/oauth/clients";
import { oauthLimits } from "@/lib/oauth/config";
import { corsOAuthEndpoint, corsPreflightResponse, withCorsHeaders, withoutCookies } from "@/lib/oauth/cors-rules";
import { oauthErrorResponse, oauthRateLimits, publicOAuthEndpoint, withPolicyScope, type PublicOAuthEndpoint } from "@/lib/oauth/request-policy";

/**
 * Abuse limits for the OAuth endpoints anyone can call: a per-network rate
 * limit on each, and a cap on stored apps nobody approved yet. Returns a
 * response to send instead, or null to go on.
 */
async function refuseAbuse(request: Request, endpoint: PublicOAuthEndpoint): Promise<Response | null> {
  const name = oauthRateLimits[endpoint];
  const decision = await hitRateLimit(name, networkKey(request.headers));
  if (!decision.allowed) {
    return oauthErrorResponse(429, "rate_limited", `${rateLimitMessages[name]} Try again in ${describeWait(decision.retryAfterSeconds)}.`, {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }
  if (endpoint === "register" && (await countUnapprovedClients()) >= oauthLimits.maxUnapprovedClients) {
    return oauthErrorResponse(503, "temporarily_unavailable", "Too many apps are waiting for approval. Try again later.", { "Retry-After": "3600" });
  }
  return null;
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
  const endpoint = publicOAuthEndpoint(request.method, url.pathname);
  if (!endpoint) return request;
  try {
    const refusal = await refuseAbuse(request, endpoint);
    if (refusal) return refusal;
  } catch (error) {
    // A limit check that fails open keeps sign-in working when the counters are unavailable.
    console.error("[oauth] Abuse check failed", error instanceof Error ? error.name : "unknown error");
  }
  if (endpoint !== "authorize") return request;
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
  return withCorsHeaders(await handle(withoutCookies(request)));
}

/** Better Auth endpoints: GitHub and Google sign-in, magic links, password sign-in for accounts given one, sessions, and the OAuth server for MCP clients. */
export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return corsOAuthEndpoint(new URL(request.url).pathname) ? handleCors(request) : handle(request);
}

/** Preflight for the CORS-enabled OAuth endpoints. Every other path answers as Next does by default, with no CORS headers. */
export function OPTIONS(request: Request) {
  if (corsOAuthEndpoint(new URL(request.url).pathname)) return corsPreflightResponse();
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}
