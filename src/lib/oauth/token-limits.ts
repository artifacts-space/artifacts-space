import { networkKey, networkKeySecret } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimit, hitRateLimits, peekRateLimit } from "@/lib/abuse/rate-limit";

import { hashOAuthToken } from "./config";
import { findCodeTrace, findRefreshGrant } from "./limit-store";
import { oauthRateLimited } from "./request-policy";
import {
  isCountedTokenFailure,
  isKnownCode,
  isKnownRefreshToken,
  oauthConnectionKey,
  oauthCredentialKey,
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
 * indexed lookup decides whether the request presents a code or refresh
 * token this server issued to the client presenting it, in any state:
 * waiting, used, rotated, expired, or revoked. Such a known credential goes
 * on to Better Auth, so a replayed rotated token revokes its family, a used
 * code revokes what it issued, and a dead connection gets invalid_grant; it
 * also counts one attempt for that credential from that address
 * (oauthTokenAttemptsByCredential), and past that limit it is treated as
 * unknown. The attempts are per address so that a thief holding a token
 * cannot use up its tries where the rightful app sends it. A request with no known
 * credential reserves one failure for its network on arrival and is refused
 * once the network is over its failure limit. A usable refresh also meets
 * its connection's limit.
 *
 * After: a 4xx answer to a known credential counts one failure for the
 * network; a 200 to a refresh counts one for the connection.
 *
 * Counting on arrival is atomic (one upsert per request), so concurrent
 * unknown requests cannot overshoot the failure limit. Failures of known
 * credentials are counted after the answer and can overshoot under
 * concurrency, but each credential is held to a few attempts first.
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
  /** True when the request's failure was not counted on arrival. */
  countFailure: boolean;
  connection: string | null;
}

type TokenPlan = { refused: Response } | TokenOutcomeKeys;

/** The counter key of a known credential, and for a usable refresh, its connection key. */
interface PresentedCredential {
  credential: string | null;
  connection: string | null;
}

const unknownCredential: PresentedCredential = { credential: null, connection: null };

/** What the lookups need from the request: its fields, the client it names, and its network key. */
interface TokenRequestFacts {
  fields: TokenRequestFields;
  clientId: string | null;
  network: string;
}

async function presentedRefresh({ fields, clientId, network }: TokenRequestFacts): Promise<PresentedCredential> {
  const secret = refreshTokenSecret(fields.refreshToken);
  if (!secret) return unknownCredential;
  const tokenHash = hashOAuthToken(secret);
  const row = await findRefreshGrant(tokenHash);
  if (!row || !isKnownRefreshToken(row, clientId)) return unknownCredential;
  const keySecret = networkKeySecret();
  const connection = refreshConnection(row, clientId, new Date());
  return {
    credential: oauthCredentialKey("refresh_token", tokenHash, network, keySecret),
    connection: connection ? oauthConnectionKey(connection.userId, connection.clientId, keySecret) : null,
  };
}

async function presentedCode({ fields, clientId, network }: TokenRequestFacts): Promise<PresentedCredential> {
  if (!fields.code) return unknownCredential;
  const codeHash = hashOAuthToken(fields.code);
  if (!isKnownCode(await findCodeTrace(codeHash), clientId)) return unknownCredential;
  return { credential: oauthCredentialKey("code", codeHash, network, networkKeySecret()), connection: null };
}

async function presentedCredential(request: Request, network: string): Promise<PresentedCredential> {
  const fields = tokenRequestFields(await request.clone().text(), request.headers.get("content-type"));
  const facts = { fields, clientId: presentedClientId(fields, request.headers.get("authorization")), network };
  if (fields.grantType === "refresh_token") return presentedRefresh(facts);
  if (fields.grantType === "authorization_code") return presentedCode(facts);
  return unknownCredential;
}

/** Counts one attempt for a known credential; returns false when it is over its limit and must be treated as unknown. */
async function withinCredentialAttempts(credential: string | null): Promise<boolean> {
  if (!credential) return false;
  return (await hitRateLimits([{ name: "oauthTokenAttemptsByCredential", subject: credential }])) === null;
}

async function planTokenRequest(request: Request): Promise<TokenPlan> {
  const network = networkKey(request.headers);
  const load = await hitRateLimit("oauthToken", network);
  if (!load.allowed) return { refused: oauthRateLimited("oauthToken", load.retryAfterSeconds) };
  const presented = await presentedCredential(request, network);
  const known = await withinCredentialAttempts(presented.credential);
  if (!known) {
    const refusal = await hitRateLimits([{ name: "oauthTokenFailuresByNetwork", subject: network }]);
    if (refusal) return { refused: oauthRateLimited(refusal.name, refusal.retryAfterSeconds) };
  }
  if (presented.connection) {
    const decision = await peekRateLimit("oauthRefreshByConnection", presented.connection);
    if (!decision.allowed) return { refused: oauthRateLimited("oauthRefreshByConnection", decision.retryAfterSeconds) };
  }
  return { network, countFailure: known, connection: presented.connection };
}

async function countOutcome(keys: TokenOutcomeKeys, status: number): Promise<void> {
  try {
    if (isCountedTokenFailure(status)) {
      if (keys.countFailure) await countRateLimitHit("oauthTokenFailuresByNetwork", keys.network);
    } else if (status === 200 && keys.connection) await countRateLimitHit("oauthRefreshByConnection", keys.connection);
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
