import { networkKey, networkKeySecret } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimit, peekRateLimit } from "@/lib/abuse/rate-limit";

import { hashOAuthToken } from "./config";
import { findRefreshGrant } from "./limit-store";
import { oauthRateLimited } from "./request-policy";
import { isCountedTokenFailure, oauthConnectionKey, presentedClientId, refreshConnection, refreshTokenSecret, tokenRequestFields } from "./token-limit-rules";

/**
 * The auth route's limits on `/api/auth/oauth2/token`
 * (src/app/api/auth/[...all]/route.ts), in the shape of the password sign-in
 * limits: checked before Better Auth runs, with outcomes counted after it
 * answers.
 *
 * Before: the network's failure limit (peeked, not counted), the network's
 * load backstop (counted on every request), and, for a refresh with a usable
 * token, the connection's limit (peeked). After: a 4xx answer counts one
 * failure for the network; a 200 to a refresh counts one for the connection.
 * Hosted apps send every user's refreshes from a few shared addresses, so
 * nothing that succeeds is limited per address except the backstop.
 */

/** What to count once Better Auth answers. */
interface TokenOutcomeKeys {
  network: string;
  connection: string | null;
}

type TokenPlan = { refused: Response } | TokenOutcomeKeys;

/** The connection key for a refresh whose token Better Auth would accept from this client, or null. */
async function connectionFor(request: Request): Promise<string | null> {
  const fields = tokenRequestFields(await request.clone().text(), request.headers.get("content-type"));
  if (fields.grantType !== "refresh_token") return null;
  const secret = refreshTokenSecret(fields.refreshToken);
  if (!secret) return null;
  const row = await findRefreshGrant(hashOAuthToken(secret));
  const connection = row ? refreshConnection(row, presentedClientId(fields, request.headers.get("authorization")), new Date()) : null;
  return connection ? oauthConnectionKey(connection.userId, connection.clientId, networkKeySecret()) : null;
}

async function planTokenRequest(request: Request): Promise<TokenPlan> {
  const network = networkKey(request.headers);
  const failures = await peekRateLimit("oauthTokenFailuresByNetwork", network);
  if (!failures.allowed) return { refused: oauthRateLimited("oauthTokenFailuresByNetwork", failures.retryAfterSeconds) };
  const load = await hitRateLimit("oauthToken", network);
  if (!load.allowed) return { refused: oauthRateLimited("oauthToken", load.retryAfterSeconds) };
  const connection = await connectionFor(request);
  if (connection) {
    const decision = await peekRateLimit("oauthRefreshByConnection", connection);
    if (!decision.allowed) return { refused: oauthRateLimited("oauthRefreshByConnection", decision.retryAfterSeconds) };
  }
  return { network, connection };
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
