import { oauthTokenPrefixes } from "./config";
import { accessFromScopes, type McpAccess } from "./scopes";

/** What the MCP route needs from a stored OAuth access token and its app. */
export interface StoredAccessToken {
  userId: string | null;
  scopes: string[];
  resources: string[] | null;
  expiresAt: Date | null;
  revoked: Date | null;
  clientDisabled: boolean | null;
  /** Set when the token is sender-constrained (DPoP). The MCP route does not check proofs, so it refuses these. */
  confirmation: unknown;
  /** Whether the person's approval for this app still exists. Revoking an app deletes it. */
  approved: boolean;
}

/** The token's secret part, or null when the value is not an OAuth access token. */
export function oauthAccessTokenSecret(token: string): string | null {
  if (!token.startsWith(oauthTokenPrefixes.opaqueAccessToken)) return null;
  const secret = token.slice(oauthTokenPrefixes.opaqueAccessToken.length);
  return secret.length > 0 ? secret : null;
}

/** Still live: unexpired, unrevoked, from an enabled app the person still approves, and a plain bearer token. */
function isLive(row: StoredAccessToken, now: Date): boolean {
  if (!row.approved || row.revoked || row.clientDisabled) return false;
  if (row.confirmation !== null && row.confirmation !== undefined) return false;
  return row.expiresAt !== null && row.expiresAt > now;
}

/**
 * Whether a stored access token may call the MCP resource now, and as whom.
 * It must be unexpired, unrevoked, from an enabled app the person still
 * approves, and bound to this exact resource (RFC 8707 audience). A token
 * issued without a resource, or for another one, is refused, and so is a
 * DPoP-bound token, because this route only accepts plain bearer tokens.
 */
export function oauthTokenGrant(
  row: StoredAccessToken,
  resource: string,
  now: Date,
): { userId: string; access: McpAccess } | null {
  if (!row.userId || !isLive(row, now) || !row.resources?.includes(resource)) return null;
  const access = accessFromScopes(row.scopes);
  return access ? { userId: row.userId, access } : null;
}
