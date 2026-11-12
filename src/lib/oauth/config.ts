import { createHash } from "node:crypto";

import type { OAuthOptions } from "@better-auth/oauth-provider";

import { mcpEndpoint } from "@/lib/setup/mcp-config";
import { siteOrigin } from "@/lib/site-origin";

/** Prefixes on tokens the OAuth server issues, so they read differently from API tokens. Not stored. */
export const oauthTokenPrefixes = {
  opaqueAccessToken: "artifacts_oat_",
  refreshToken: "artifacts_ort_",
} as const satisfies OAuthOptions["prefix"];

/** Lifetimes and limits for the OAuth server. */
export const oauthLimits = {
  /** Access tokens last an hour; clients refresh them. */
  accessTokenSeconds: 60 * 60,
  /** A refresh token lasts 30 days and rotates on every use. */
  refreshTokenSeconds: 30 * 24 * 60 * 60,
  /** A retried refresh within this many seconds gets the same answer instead of failing. */
  refreshReuseSeconds: 30,
  /** Registered apps nobody approved are deleted after this long. */
  unapprovedClientHours: 24,
  /**
   * Most unapproved apps stored at once. Registration pauses above this.
   * Each one is two small rows (the app and its resource link), so this
   * bounds the table, not the cost of a row.
   */
  maxUnapprovedClients: 2000,
  /**
   * Most unapproved apps one network address may have within the window
   * above. Approved apps never count, so a hosted app whose people finish
   * connecting is limited only by the hourly registration limit; one address
   * cannot hold more than a twentieth of the pool.
   */
  maxUnapprovedClientsPerNetwork: 100,
} as const;

/**
 * Better Auth's own per-instance, in-memory limits on the token and
 * registration endpoints (20 and 5 a minute per address by default). The
 * Postgres limits in src/lib/abuse/limits.ts are the real ones; these are
 * raised far above any real burst so they never throttle a hosted app that
 * serves many people from one address.
 */
export const betterAuthEndpointBursts = {
  token: { window: 10, max: 1000 },
  register: { window: 10, max: 100 },
} as const;

/**
 * The protected resource every OAuth token is bound to: the MCP endpoint on
 * this site's origin, such as https://artifacts.space/api/mcp.
 */
export function mcpResource(env: NodeJS.ProcessEnv = process.env): string {
  return mcpEndpoint(siteOrigin(env));
}

/**
 * How the OAuth server stores tokens and authorization codes: a SHA-256 hex
 * digest, so a database leak does not leak working tokens. The MCP route
 * looks tokens up with the same function.
 *
 * These are never passwords. Better Auth makes each one from 32 random
 * letters or digits (at least 182 bits), so a fast hash cannot be brute-forced,
 * and lookups need the same digest every time, which a salted password KDF
 * (bcrypt, scrypt, Argon2) would not give. CodeQL's
 * js/insufficient-password-hash alert here is a false positive.
 */
export function hashOAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
