/**
 * OAuth scopes for MCP clients, and how they map to what a connection may do.
 * Pure functions: the plugin config, the authorize-request policy, the consent
 * page, and the MCP route all share them.
 */

export const READ_SCOPE = "artifacts:read";
export const WRITE_SCOPE = "artifacts:write";
/** Lets a client keep its connection with rotating refresh tokens. */
export const OFFLINE_SCOPE = "offline_access";

/** Every scope the authorization server accepts. No OpenID: tokens only reach the MCP endpoint. */
export const oauthScopes = [READ_SCOPE, WRITE_SCOPE, OFFLINE_SCOPE] as const;

/** Scopes that describe access to artifacts, as advertised to MCP clients. */
export const resourceScopes = [READ_SCOPE, WRITE_SCOPE] as const;

/** What one MCP connection may do. API tokens always get "full". */
export type McpAccess = "full" | "read";

const knownScopes = new Set<string>(oauthScopes);

function splitScope(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

/**
 * The scope an authorization request really asks for under this server's
 * policy. Unknown scopes (such as `openid`) are dropped. No artifacts scope
 * means full access, write implies read, and offline_access is always added
 * so the client gets a refresh token and stays connected.
 */
export function normalizeRequestedScope(scope: string | null | undefined): string {
  const requested = new Set(splitScope(scope).filter((item) => knownScopes.has(item)));
  if (!requested.has(READ_SCOPE) && !requested.has(WRITE_SCOPE)) requested.add(WRITE_SCOPE);
  requested.add(READ_SCOPE);
  requested.add(OFFLINE_SCOPE);
  return oauthScopes.filter((item) => requested.has(item)).join(" ");
}

/** The access a set of granted scopes gives, or null when it gives none. */
export function accessFromScopes(scopes: readonly string[]): McpAccess | null {
  if (scopes.includes(WRITE_SCOPE)) return "full";
  if (scopes.includes(READ_SCOPE)) return "read";
  return null;
}

/** Whether the client asked for write access, so the person has a choice to make. */
export function requestsWrite(scope: string | null | undefined): boolean {
  return splitScope(scope).includes(WRITE_SCOPE);
}

/**
 * The scope string the consent page approves: everything requested, or the
 * same without write access when the person chose read-only.
 */
export function consentScope(requested: string | null | undefined, readOnly: boolean): string {
  const scopes = splitScope(requested);
  return (readOnly ? scopes.filter((item) => item !== WRITE_SCOPE) : scopes).join(" ");
}
