import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimit } from "@/lib/abuse/rate-limit";
import { rateLimitMessages } from "@/lib/abuse/limits";
import { describeWait } from "@/lib/abuse/rate-limit-window";
import { getAuth } from "@/lib/auth/server";
import { countUnapprovedClients } from "@/lib/oauth/clients";
import { oauthLimits } from "@/lib/oauth/config";
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
 * Applies the abuse limits, then rewrites an authorization request's scope to
 * this server's policy (no scope means full access, and offline_access is
 * always added so clients get refresh tokens).
 */
async function prepare(request: Request): Promise<Request | Response> {
  const url = new URL(request.url);
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
  const prepared = await prepare(request);
  if (prepared instanceof Response) return prepared;
  return getAuth().handler(prepared);
}

/** Better Auth endpoints: GitHub OAuth, magic links, sessions, and the OAuth server for MCP clients. */
export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
