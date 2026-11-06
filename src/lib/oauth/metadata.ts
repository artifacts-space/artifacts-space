import { mcpResource } from "./config";
import { resourceScopes } from "./scopes";

/** Where Better Auth serves its endpoints, and so the OAuth issuer's path. */
export const AUTH_BASE_PATH = "/api/auth";

/** The OAuth issuer: Better Auth's base URL on this site, such as https://artifacts.space/api/auth. */
export function oauthIssuer(env: NodeJS.ProcessEnv = process.env): string {
  return `${new URL(mcpResource(env)).origin}${AUTH_BASE_PATH}`;
}

/** Path segments after a well-known prefix as one path, such as ["api", "mcp"] → "/api/mcp". */
export function suffixPath(segments: readonly string[] | undefined): string {
  return segments?.length ? `/${segments.join("/")}` : "";
}

/**
 * RFC 9728 protected resource metadata for the MCP endpoint. MCP clients read
 * it after a 401 to find the authorization server and the scopes to ask for.
 */
export function protectedResourceMetadata(env: NodeJS.ProcessEnv = process.env) {
  return {
    resource: mcpResource(env),
    authorization_servers: [oauthIssuer(env)],
    bearer_methods_supported: ["header"],
    scopes_supported: [...resourceScopes],
    resource_name: "artifacts.space",
  };
}

/** Headers for public discovery documents: any origin may read them, and caches may keep them briefly. */
export const discoveryHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
} as const;

/**
 * The `WWW-Authenticate` challenge for a request without a valid token
 * (RFC 6750 and RFC 9728), pointing MCP clients at the resource metadata.
 */
export function bearerChallenge(env: NodeJS.ProcessEnv = process.env, error?: "invalid_token"): string {
  const metadataUrl = `${new URL(mcpResource(env)).origin}/.well-known/oauth-protected-resource${new URL(mcpResource(env)).pathname}`;
  const parts = [`resource_metadata="${metadataUrl}"`, `scope="${resourceScopes.join(" ")}"`];
  if (error) parts.unshift(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}
