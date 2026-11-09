import { authenticateOAuthAccessToken } from "@/lib/oauth/clients";
import { mcpResource } from "@/lib/oauth/config";
import { oauthAccessTokenSecret } from "@/lib/oauth/token-rules";
import type { McpAccess } from "@/lib/oauth/scopes";
import type { McpConnectionRef } from "@/lib/harness/connection-ref";
import { authenticateApiToken } from "@/lib/tokens";

/** Who an MCP request acts as, and what it may do. */
export interface McpPrincipal {
  userId: string;
  access: McpAccess;
  via: "oauth" | "api-token";
  /**
   * Identifies the connection for per-token rate limits: the API token's id,
   * or the OAuth app and person (OAuth access tokens rotate every hour, the
   * app's approval does not).
   */
  tokenKey: string;
  /** The connection the request came through, for its harness (src/lib/harness). Server-side only; never shown. */
  connection: McpConnectionRef;
}

/** The bearer token from an Authorization header, or null. */
export function bearerToken(authorization: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Authenticates an MCP request by its bearer token. OAuth access tokens act
 * as the person who approved the app, with the access they granted, and only
 * for this site's MCP resource. Personal and agent API tokens keep full access.
 * There is no session-cookie fallback: nothing in the app calls /api/mcp from
 * the browser, and every client gets the same 401 discovery path.
 */
export async function authenticateMcpRequest(request: Request): Promise<McpPrincipal | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;

  if (oauthAccessTokenSecret(token)) {
    const grant = await authenticateOAuthAccessToken(token, mcpResource());
    if (grant) {
      const connection: McpConnectionRef = { kind: "oauth", userId: grant.userId, clientId: grant.clientId };
      return { userId: grant.userId, access: grant.access, via: "oauth", tokenKey: `oauth:${grant.clientId}:${grant.userId}`, connection };
    }
  }

  const apiToken = await authenticateApiToken(token);
  if (!apiToken) return null;
  const connection: McpConnectionRef = { kind: "api-token", userId: apiToken.userId, tokenId: apiToken.tokenId };
  return { userId: apiToken.userId, access: "full", via: "api-token", tokenKey: `api:${apiToken.tokenId}`, connection };
}
