/**
 * Cross-origin access to the OAuth token and revoke endpoints, so a client
 * that runs only in a browser (a web-based MCP client) can finish sign-in and
 * sign out. Every origin may call them, because they never use cookies: a
 * code needs its PKCE verifier, and a refresh or revoke needs the token
 * itself, so another site cannot use someone's approval. Credentials are
 * never allowed, and introspection stays closed to browsers.
 */

/** The OAuth endpoints a browser on any origin may call. */
export type CorsOAuthEndpoint = "token" | "revoke";

const corsPaths: Record<string, CorsOAuthEndpoint> = {
  "/api/auth/oauth2/token": "token",
  "/api/auth/oauth2/revoke": "revoke",
};

/** Which CORS-enabled OAuth endpoint a path is, or null for every other path (introspect included). */
export function corsOAuthEndpoint(pathname: string): CorsOAuthEndpoint | null {
  return corsPaths[pathname.replace(/\/+$/, "")] ?? null;
}

/** How long a browser may reuse a preflight answer, in seconds. */
export const CORS_MAX_AGE_SECONDS = 600;

/** Headers on every answer from a CORS-enabled endpoint. Never Access-Control-Allow-Credentials. */
export const corsResponseHeaders: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
};

/** Headers on the preflight (OPTIONS) answer: only what the endpoints need. */
export const corsPreflightHeaders: Readonly<Record<string, string>> = {
  ...corsResponseHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": String(CORS_MAX_AGE_SECONDS),
};

/** The preflight answer for a CORS-enabled endpoint: 204 with the allowed method and headers. */
export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: corsPreflightHeaders });
}

/**
 * The response with cross-origin read access added. Any credentials header
 * is removed, so browsers never send cookies with these calls.
 */
export function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsResponseHeaders)) headers.set(key, value);
  headers.delete("Access-Control-Allow-Credentials");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * The request without its Cookie header. The token and revoke endpoints
 * authenticate with the code, verifier, client, or token in the body, never
 * with a session, so no cookie may reach them from another site.
 */
export function withoutCookies(request: Request): Request {
  if (!request.headers.has("cookie")) return request;
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  return new Request(request, { headers });
}
