import { createHmac } from "node:crypto";

import { z } from "zod";

import { oauthTokenPrefixes } from "./config";

/**
 * Pure rules for the token endpoint's limits (src/lib/oauth/token-limits.ts):
 * what the limits read from a request, what counts as a failure, whether the
 * request presents a credential this server issued, and which connection a
 * refresh belongs to. No database, so they test alone.
 */

/** The parts of a token request body the limits read. Each is null when missing or unreadable. */
export interface TokenRequestFields {
  grantType: string | null;
  refreshToken: string | null;
  code: string | null;
  clientId: string | null;
  /** True when the body carries a client assertion (private_key_jwt). */
  clientAssertion: boolean;
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

/**
 * Form values, with client_id read as Better Auth reads it
 * (normalizeClientAuthenticationParameters): the one non-empty value, or
 * none when it is repeated, which Better Auth refuses.
 */
function formValues(body: string): Record<string, unknown> {
  const params = new URLSearchParams(body);
  const values: Record<string, unknown> = Object.fromEntries(params);
  const clientIds = params.getAll("client_id").filter((value) => value.length > 0);
  values.client_id = clientIds.length === 1 ? clientIds[0] : undefined;
  return values;
}

function bodyValues(body: string, contentType: string | null): Record<string, unknown> {
  if (!isJson(contentType)) return formValues(body);
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
  return {
    grantType: field(values.grant_type),
    refreshToken: field(values.refresh_token),
    code: field(values.code),
    clientId: field(values.client_id),
    clientAssertion: field(values.client_assertion) !== null || field(values.client_assertion_type) !== null,
  };
}

const basicPattern = /^Basic +(.*)$/i;

/** One application/x-www-form-urlencoded value, as Better Auth decodes it ("+" and "%20" are spaces). */
function formUrlDecode(value: string): string {
  return new URLSearchParams(`v=${value}`).get("v") ?? "";
}

/**
 * The client id from an HTTP Basic `Authorization` header, decoded as Better
 * Auth decodes it (RFC 6749 §2.3.1: base64, split on the first ":", each half
 * form-decoded, both halves non-empty), or null when it would refuse it.
 */
export function basicAuthClientId(authorization: string | null): string | null {
  const match = basicPattern.exec(authorization ?? "");
  if (match?.[1] === undefined) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) return null;
  return field(formUrlDecode(decoded.slice(0, separator)));
}

/**
 * The client a token request names, read in Better Auth's order
 * (extractClientCredentials): any Authorization header wins, and only a
 * well-formed Basic one names a client; without the header, the body's
 * client_id. A client assertion names no client here, so the request counts
 * as presenting no known credential.
 */
export function presentedClientId(fields: TokenRequestFields, authorization: string | null): string | null {
  if (fields.clientAssertion) return null;
  if (authorization) return basicAuthClientId(authorization);
  return fields.clientId;
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

/**
 * What the database holds for a presented code: the values of Better Auth's
 * verification rows under its hash (the code, used or not yet, expired or
 * not; Better Auth deletes the row when the code is used), and the clients of
 * tokens issued from it (a used code).
 */
export interface StoredCodeTrace {
  values: readonly string[];
  tokenClientIds: readonly string[];
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
 * Whether a presented code is one this server issued to the presenting
 * client, in any state: waiting, expired, or already used. Each goes on to
 * Better Auth, which must see it: an expired code gets invalid_grant (so the
 * app asks the person again), and a used one makes it revoke the tokens that
 * code issued (RFC 6749 §4.1.2). The PKCE verifier and the redirect are
 * Better Auth's to check.
 */
export function isKnownCode(stored: StoredCodeTrace, clientId: string | null): boolean {
  if (clientId === null) return false;
  return stored.tokenClientIds.includes(clientId) || stored.values.some((value) => codeClientId(value) === clientId);
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
 * Whether a stored refresh token was issued to the presenting client. In any
 * state (live, rotated, expired, revoked) it goes on to Better Auth: a
 * replayed rotated token must reach it so it revokes the whole family, and a
 * dead one must get invalid_grant so the app asks the person to reconnect.
 */
export function isKnownRefreshToken(row: StoredRefreshGrant, clientId: string | null): boolean {
  return clientId !== null && row.clientId === clientId;
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
 * the connection limit does not apply: the token is not usable now, or it
 * was issued to another client than the one presenting it. Those requests
 * go on to Better Auth (or meet the failure limits), which refuses them, and
 * they count as failures. So the connection limit can only answer for a
 * refresh that would otherwise succeed, and its refusal says nothing a
 * success would not.
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

/**
 * The counter key for one presented credential from one network address
 * (oauthTokenAttemptsByCredential): an HMAC under the server secret of its
 * kind, its stored hash, and the address's network key, never the token or
 * a plain hash of it. Per address, so someone holding a stolen token cannot
 * use up its tries where the rightful app sends it: the app's replay of a
 * rotated token still reaches Better Auth, which revokes the family.
 */
export function oauthCredentialKey(kind: "code" | "refresh_token", storedHash: string, network: string, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["oauth-credential", kind, storedHash, network])).digest("hex").slice(0, 32);
}
