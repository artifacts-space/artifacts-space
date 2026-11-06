import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { oauthProvider } from "@better-auth/oauth-provider";

import { hashOAuthToken, mcpResource, oauthLimits, oauthTokenPrefixes } from "@/lib/oauth/config";
import { oauthScopes } from "@/lib/oauth/scopes";

/** Where the OAuth server sends people: sign-in first, then the approval page. */
export const oauthPages = {
  login: "/oauth/sign-in",
  consent: "/oauth/consent",
} as const;

/**
 * The OAuth 2.1 authorization server for MCP clients (Claude Code, Cursor,
 * and others): dynamic client registration, Client ID Metadata Documents,
 * PKCE (S256 only), opaque access tokens bound to the MCP resource, and
 * rotating refresh tokens.
 *
 * Access tokens are opaque rather than JWTs, so revoking an app takes effect
 * on the next request and no signing key is needed: everything secret
 * derives from BETTER_AUTH_SECRET.
 */
export function oauthPlugins() {
  const resource = mcpResource();
  return [
    oauthProvider({
      loginPage: oauthPages.login,
      consentPage: oauthPages.consent,
      scopes: [...oauthScopes],
      grantTypes: ["authorization_code", "refresh_token"],
      disableJwtPlugin: true,
      resources: [{ identifier: resource, name: "artifacts.space MCP" }],
      clientRegistrationDefaultResources: [resource],
      // There is one resource, so every client may ask for it.
      enforcePerClientResources: false,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Claude Code and Cursor register loopback or custom-scheme callbacks without an application_type.
      clientRegistrationDefaultApplicationType: "infer",
      accessTokenExpiresIn: oauthLimits.accessTokenSeconds,
      refreshTokenExpiresIn: oauthLimits.refreshTokenSeconds,
      refreshTokenReuseInterval: oauthLimits.refreshReuseSeconds,
      storeTokens: { hash: hashOAuthToken },
      prefix: oauthTokenPrefixes,
    }),
    cimd({
      fetchClientMetadataResource,
      // MCP pins Client ID Metadata Documents draft-00: client_name and redirect_uris are required.
      metadataProfile: "mcp-2026-07-28",
    }),
  ] as const;
}
