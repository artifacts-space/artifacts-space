import { networkKey, networkKeySecret } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimit, peekRateLimit } from "@/lib/abuse/rate-limit";

import { hashOAuthToken } from "./config";
import { findCodeGrant, findRefreshGrant } from "./limit-store";
import { oauthRateLimited } from "./request-policy";
import {
  isCountedTokenFailure,
  isUsableCodeGrant,
  oauthConnectionKey,
  presentedClientId,
  refreshConnection,
  refreshTokenSecret,
  tokenRequestFields,
  type TokenRequestFields,
} from "./token-limit-rules";

/**
 * The auth route's limits on `/api/auth/oauth2/token`
 * (src/app/api/auth/[...all]/route.ts), in the shape of the password sign-in
 * limits: checked before Better Auth runs, with outcomes counted after it
 * answers.
 *
 * Before: the network's load backstop is counted on every request. Then one
 * indexed lookup decides whether the request presents a credential that is
 * valid now: an unexpired authorization code or a usable refresh token,
 * issued to the client presenting it. A request without one is refused while
 * its network is over the failure limit; a request with one always goes on,
 * so failures from a hosted app's shared address (expired or revoked
 * connections, or bogus codes anyone can push through the app's callback)
 * never stop that app's other users. A valid refresh also meets its
 * connection's limit. After: a 4xx answer counts one failure for the
 * network; a 200 to a refresh counts one for the connection.
 *
 * The failure limit caps the error work and noise one address causes. It is
 * not what stops guessing: codes (32 characters of [a-zA-Z0-9], about 190
 * bits), refresh tokens and client secrets (32 of [a-zA-Z], about 182 bits)
 * cannot be guessed at the backstop's rate, and codes and tokens are stored
 * only as SHA-256 hashes (client secrets encrypted).
 */

/** What to count once Better Auth answers. */
interface TokenOutcomeKeys {
  network: string;
  connection: string | null;
}

type TokenPlan = { refused: Response } | TokenOutcomeKeys;

/** Whether the request presents a credential valid now, and for a refresh, its connection key. */
interface PresentedCredential {
  valid: boolean;
  connection: string | null;
}

const noCredential: PresentedCredential = { valid: false, connection: null };

async function presentedRefresh(fields: TokenRequestFields, clientId: string | null): Promise<PresentedCredential> {
  const secret = refreshTokenSecret(fields.refreshToken);
  if (!secret) return noCredential;
  const row = await findRefreshGrant(hashOAuthToken(secret));
  const connection = row ? refreshConnection(row, clientId, new Date()) : null;
  if (!connection) return noCredential;
  return { valid: true, connection: oauthConnectionKey(connection.userId, connection.clientId, networkKeySecret()) };
}

async function presentedCode(fields: TokenRequestFields, clientId: string | null): Promise<PresentedCredential> {
  if (!fields.code) return noCredential;
  const row = await findCodeGrant(hashOAuthToken(fields.code));
  return { valid: row !== null && isUsableCodeGrant(row, clientId, new Date()), connection: null };
}

async function presentedCredential(request: Request): Promise<PresentedCredential> {
  const fields = tokenRequestFields(await request.clone().text(), request.headers.get("content-type"));
  const clientId = presentedClientId(fields, request.headers.get("authorization"));
  if (fields.grantType === "refresh_token") return presentedRefresh(fields, clientId);
  if (fields.grantType === "authorization_code") return presentedCode(fields, clientId);
  return noCredential;
}

async function planTokenRequest(request: Request): Promise<TokenPlan> {
  const network = networkKey(request.headers);
  const load = await hitRateLimit("oauthToken", network);
  if (!load.allowed) return { refused: oauthRateLimited("oauthToken", load.retryAfterSeconds) };
  const credential = await presentedCredential(request);
  if (!credential.valid) {
    const failures = await peekRateLimit("oauthTokenFailuresByNetwork", network);
    if (!failures.allowed) return { refused: oauthRateLimited("oauthTokenFailuresByNetwork", failures.retryAfterSeconds) };
  }
  if (credential.connection) {
    const decision = await peekRateLimit("oauthRefreshByConnection", credential.connection);
    if (!decision.allowed) return { refused: oauthRateLimited("oauthRefreshByConnection", decision.retryAfterSeconds) };
  }
  return { network, connection: credential.connection };
}

async function countOutcome(keys: TokenOutcomeKeys, status: number): Promise<void> {
  try {
    if (isCountedTokenFailure(status)) await countRateLimitHit("oauthTokenFailuresByNetwork", keys.network);
    else if (status === 200 && keys.connection) await countRateLimitHit("oauthRefreshByConnection", keys.connection);
  } catch (error) {
    console.error("[oauth] Counting a token request failed", error instanceof Error ? error.name : "unknown error");
  }
}

/**
 * Answers a token request through `answer` (Better Auth's handler) within
 * the limits. A refusal is a 429 in the OAuth error shape with Retry-After,
 * sent before Better Auth reads the request. The checks fail open, like the
 * other OAuth limits: when the counters are unavailable the request goes
 * through uncounted, because Better Auth needs the same database to answer.
 */
export async function handleTokenRequest(request: Request, answer: (request: Request) => Promise<Response>): Promise<Response> {
  let plan: TokenPlan | null = null;
  try {
    plan = await planTokenRequest(request);
  } catch (error) {
    console.error("[oauth] Token limit check failed", error instanceof Error ? error.name : "unknown error");
  }
  if (plan && "refused" in plan) return plan.refused;
  const response = await answer(request);
  if (plan) await countOutcome(plan, response.status);
  return response;
}
