import { createHmac } from "node:crypto";

import { z } from "zod";

import { oauthTokenPrefixes } from "./config";

/**
 * Pure rules for the token endpoint's limits (src/lib/oauth/token-limits.ts):
 * what the limits read from a request, what counts as a failure, whether the
 * request presents a credential that is valid now, and which connection a
 * refresh belongs to. No database, so they test alone.
 */

/** The parts of a token request body the limits read. Each is null when missing or unreadable. */
export interface TokenRequestFields {
  grantType: string | null;
  refreshToken: string | null;
  code: string | null;
  clientId: string | null;
}

const fieldSchema = z.string().min(1).max(4096);
const jsonBodySchema = z.record(z.string(), z.unknown());

function field(value: unknown): string | null {
  const parsed = fieldSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isJson(contentType: string | null): boolean {
  return contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

function bodyValues(body: string, contentType: string | null): Record<string, unknown> {
  if (!isJson(contentType)) return Object.fromEntries(new URLSearchParams(body));
  try {
    const parsed = jsonBodySchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Reads grant_type, refresh_token, code, and client_id from a token request body,
 * form-encoded (what OAuth clients send) or JSON (which Better Auth also
 * takes). Anything else reads as empty; Better Auth then refuses it.
 */
export function tokenRequestFields(body: string, contentType: string | null): TokenRequestFields {
  const values = bodyValues(body, contentType);
  return { grantType: field(values.grant_type), refreshToken: field(values.refresh_token), code: field(values.code), clientId: field(values.client_id) };
}

/** The client id from an HTTP Basic `Authorization` header (RFC 6749 §2.3.1), or null. */
export function basicAuthClientId(authorization: string | null): string | null {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization ?? "");
  if (!match?.[1]) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;
  try {
    return field(decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, " ")));
  } catch {
    return null;
  }
}

/** The client a token request names: client_id in the body, else the Basic header's. */
export function presentedClientId(fields: TokenRequestFields, authorization: string | null): string | null {
  return fields.clientId ?? basicAuthClientId(authorization);
}

/** The secret part of a refresh token this server issued (after its prefix), or null for anything else. */
export function refreshTokenSecret(token: string | null): string | null {
  if (!token?.startsWith(oauthTokenPrefixes.refreshToken)) return null;
  const secret = token.slice(oauthTokenPrefixes.refreshToken.length);
  return secret.length > 0 ? secret : null;
}

/**
 * Whether the token endpoint's answer counts as a failure against the
 * network's failure limit: every client error Better Auth gives (invalid_grant
 * for a bad, expired, rotated, or mismatched code or refresh token or a PKCE
 * mismatch; invalid_client; invalid_request and unsupported_grant_type for
 * malformed requests; invalid_scope and invalid_target). A 429 never counts,
 * and neither does a 5xx, which is this server's fault, not the caller's.
 */
export function isCountedTokenFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/** What the limits need from a stored authorization code (Better Auth's verification row). */
export interface StoredCodeGrant {
  value: string;
  expiresAt: Date;
}

const codeValueSchema = z.object({ type: z.literal("authorization_code"), query: z.object({ client_id: z.string() }) });

function codeClientId(value: string): string | null {
  try {
    const parsed = codeValueSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.query.client_id : null;
  } catch {
    return null;
  }
}

/**
 * Whether a stored authorization code is valid now for the client presenting
 * it: unexpired, and issued to that client. Better Auth deletes a code when
 * it is used, so a used code is not found at all. The PKCE verifier and the
 * redirect are still Better Auth's to check.
 */
export function isUsableCodeGrant(row: StoredCodeGrant, clientId: string | null, now: Date): boolean {
  return clientId !== null && row.expiresAt > now && codeClientId(row.value) === clientId;
}

/** What the limits need from a stored refresh token. */
export interface StoredRefreshGrant {
  userId: string;
  clientId: string;
  expiresAt: Date | null;
  revoked: Date | null;
  rotationReplayExpiresAt: Date | null;
}

/**
 * Whether Better Auth would accept this refresh token now: unexpired, and
 * either not rotated yet or retried within the reuse window, where it
 * answers with the same tokens again.
 */
export function isUsableRefreshGrant(row: StoredRefreshGrant, now: Date): boolean {
  if (!row.expiresAt || row.expiresAt <= now) return false;
  if (!row.revoked) return true;
  return row.rotationReplayExpiresAt !== null && row.rotationReplayExpiresAt > now;
}

/**
 * The connection (person and app) a refresh is limited under, or null when
 * the connection limit does not apply: the token is not usable, or it was
 * issued to another client than the one presenting it. Those requests go on
 * to Better Auth, which refuses them (and revokes the whole family when a
 * rotated token is replayed), and they count as failures. So the connection
 * limit can only answer for a refresh that would otherwise succeed, and its
 * refusal says nothing a success would not.
 */
export function refreshConnection(row: StoredRefreshGrant, clientId: string | null, now: Date): { userId: string; clientId: string } | null {
  if (clientId !== row.clientId || !isUsableRefreshGrant(row, now)) return null;
  return { userId: row.userId, clientId: row.clientId };
}

/**
 * The counter key for one connection: an HMAC under the server secret of the
 * person and the app. Not the presented token, which rotates on every use, so
 * each refresh would get a fresh key; and not the client id alone, which a
 * metadata-document app (or a shared registration) uses for all its users.
 * Better Auth's refresh-token family is the same pair.
 */
export function oauthConnectionKey(userId: string, clientId: string, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["oauth-connection", userId, clientId])).digest("hex").slice(0, 32);
}
