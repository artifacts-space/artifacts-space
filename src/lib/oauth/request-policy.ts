import { rateLimitMessages, type RateLimitName } from "@/lib/abuse/limits";
import { describeWait } from "@/lib/abuse/rate-limit-window";

import { normalizeRequestedScope } from "./scopes";

/** The OAuth endpoints anyone on the internet can call, which need abuse limits. */
export type PublicOAuthEndpoint = "register" | "authorize" | "token";

const endpoints: Record<string, { method: string; endpoint: PublicOAuthEndpoint }> = {
  "/api/auth/oauth2/register": { method: "POST", endpoint: "register" },
  "/api/auth/oauth2/authorize": { method: "GET", endpoint: "authorize" },
  "/api/auth/oauth2/token": { method: "POST", endpoint: "token" },
};

/** Which public OAuth endpoint a request hits, or null for every other auth request. */
export function publicOAuthEndpoint(method: string, pathname: string): PublicOAuthEndpoint | null {
  const match = endpoints[pathname.replace(/\/+$/, "")];
  return match?.method === method ? match.endpoint : null;
}

/**
 * The per-network rate limit counted on every request to the authorization
 * endpoint. Registration and token requests have their own limits, some
 * counted after Better Auth answers (registration-limits.ts, token-limits.ts).
 */
export const authorizeRateLimit = "oauthAuthorize" satisfies RateLimitName;

/**
 * The authorization request URL with its scope rewritten to this server's
 * policy (see normalizeRequestedScope). Everything else stays as sent.
 */
export function withPolicyScope(url: URL): URL {
  const next = new URL(url);
  next.searchParams.set("scope", normalizeRequestedScope(url.searchParams.get("scope")));
  return next;
}

/** An OAuth-style JSON error (RFC 6749 §5.2 shape) with the given status. */
export function oauthErrorResponse(status: number, error: string, description: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * A rate-limit refusal from a public OAuth endpoint: 429, the OAuth error
 * shape, the limit's plain message with the wait, and Retry-After. The same
 * for every client, so it says nothing about any token, code, or app.
 */
export function oauthRateLimited(name: RateLimitName, retryAfterSeconds: number): Response {
  const description = `${rateLimitMessages[name]} Try again in ${describeWait(retryAfterSeconds)}.`;
  return oauthErrorResponse(429, "rate_limited", description, { "Retry-After": String(retryAfterSeconds) });
}
