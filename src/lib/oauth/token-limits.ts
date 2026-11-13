import { networkKeySecret, networkPrefixKey } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimit, hitRateLimits, peekRateLimit } from "@/lib/abuse/rate-limit";

import { hashOAuthToken } from "./config";
import { findCodeTrace, findRefreshGrant, isStoredClient } from "./limit-store";
import { oauthRateLimited } from "./request-policy";
import {
  isCountedTokenFailure,
  isKnownCode,
  isKnownRefreshToken,
  oauthConnectionKey,
  presentedClientId,
  refreshConnection,
  refreshTokenSecret,
  tokenRequestFields,
  unknownCredentialRoute,
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
 * waiting, used, rotated, expired, or revoked. Such a known credential
 * always goes on to Better Auth, so a replayed rotated token revokes its
 * family, a used code revokes what it issued, and a dead connection gets
 * invalid_grant. A request with no known credential reserves one failure
 * for its network on arrival. Once the network is over its failure limit,
 * such a request still goes on when Better Auth can answer it with lookups
 * alone (unknownCredentialRoute): a hosted app's shared address is often
 * over the limit, from stale tokens alone or because anyone can make the
 * app send bad codes, and a connection whose token we no longer hold must
 * hear invalid_grant, not a 429 it would retry forever. Only what is left
 * waits: requests with no grant or no plainly named client, and
 * metadata-document clients we have not stored. A usable refresh also meets
 * its connection's limit.
 *
 * After: a 4xx answer to a known credential counts one failure for the
 * network; a 200 to a refresh counts one for the connection.
 *
 * Counting on arrival is atomic (one upsert per request), so concurrent
 * requests cannot overshoot the failure limit.
 *
 * The failure limit caps the requests one address can make us answer the
 * costly way: fetching a metadata document, verifying a client assertion,
 * or reading a malformed body. Everything else costs a few indexed lookups
 * and is bounded by the backstop. Neither is what stops guessing: codes (32
 * characters of [a-zA-Z0-9], about 190 bits), refresh tokens and client
 * secrets (32 of [a-zA-Z], about 182 bits) cannot be guessed at the
 * backstop's rate, and codes and tokens are stored only as SHA-256 hashes
 * (client secrets encrypted).
 */

/** What to count once Better Auth answers. */
interface TokenOutcomeKeys {
  network: string;
  /** True when the request's failure was not counted on arrival. */
  countFailure: boolean;
  connection: string | null;
}

type TokenPlan = { refused: Response } | TokenOutcomeKeys;

/** Whether the request presents a known credential, and for a usable refresh, its connection key. */
interface PresentedCredential {
  known: boolean;
  connection: string | null;
}

const unknownCredential: PresentedCredential = { known: false, connection: null };

/** What the lookups need from the request: its fields and the client it names. */
interface TokenRequestFacts {
  fields: TokenRequestFields;
  clientId: string | null;
}

async function presentedRefresh({ fields, clientId }: TokenRequestFacts): Promise<PresentedCredential> {
  const secret = refreshTokenSecret(fields.refreshToken);
  if (!secret) return unknownCredential;
  const row = await findRefreshGrant(hashOAuthToken(secret));
  if (!row || !isKnownRefreshToken(row, clientId)) return unknownCredential;
  const connection = refreshConnection(row, clientId, new Date());
  return { known: true, connection: connection ? oauthConnectionKey(connection.userId, connection.clientId, networkKeySecret()) : null };
}

async function presentedCode({ fields, clientId }: TokenRequestFacts): Promise<PresentedCredential> {
  if (!fields.code) return unknownCredential;
  const known = isKnownCode(await findCodeTrace(hashOAuthToken(fields.code)), clientId);
  return { known, connection: null };
}

function presentedCredential(facts: TokenRequestFacts): Promise<PresentedCredential> {
  if (facts.fields.grantType === "refresh_token") return presentedRefresh(facts);
  if (facts.fields.grantType === "authorization_code") return presentedCode(facts);
  return Promise.resolve(unknownCredential);
}

async function tokenRequestFacts(request: Request): Promise<TokenRequestFacts> {
  const fields = tokenRequestFields(await request.clone().text(), request.headers.get("content-type"));
  return { fields, clientId: presentedClientId(fields, request.headers.get("authorization")) };
}

/** Whether Better Auth can answer a request with no known credential by lookups alone (unknownCredentialRoute). */
async function answersByLookup({ fields, clientId }: TokenRequestFacts): Promise<boolean> {
  const route = unknownCredentialRoute(fields, clientId);
  if (route !== "answer-if-stored" || clientId === null) return route === "answer";
  return isStoredClient(clientId);
}

/** Reserves a failure for the network; the refusal for a request that must wait, or null when it goes on. */
async function unknownCredentialRefusal(facts: TokenRequestFacts, network: string): Promise<Response | null> {
  const refusal = await hitRateLimits([{ name: "oauthTokenFailuresByNetwork", subject: network }]);
  if (!refusal || (await answersByLookup(facts))) return null;
  return oauthRateLimited(refusal.name, refusal.retryAfterSeconds);
}

async function planTokenRequest(request: Request): Promise<TokenPlan> {
  const network = networkPrefixKey(request.headers);
  const load = await hitRateLimit("oauthToken", network);
  if (!load.allowed) return { refused: oauthRateLimited("oauthToken", load.retryAfterSeconds) };
  const facts = await tokenRequestFacts(request);
  const presented = await presentedCredential(facts);
  if (!presented.known) {
    const refused = await unknownCredentialRefusal(facts, network);
    if (refused) return { refused };
  }
  if (presented.connection) {
    const decision = await peekRateLimit("oauthRefreshByConnection", presented.connection);
    if (!decision.allowed) return { refused: oauthRateLimited("oauthRefreshByConnection", decision.retryAfterSeconds) };
  }
  return { network, countFailure: presented.known, connection: presented.connection };
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
