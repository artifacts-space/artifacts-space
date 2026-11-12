import { networkKey } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimit } from "@/lib/abuse/rate-limit";

import { oauthLimits } from "./config";
import { dropIfPoolOverCap, evictOldestUnapproved, markClientNetwork, unapprovedClientCounts } from "./limit-store";
import { fullPoolRefusal, registeredClientId, registrationPoolRefusal, type PoolRefusal } from "./registration-limit-rules";
import { oauthErrorResponse, oauthRateLimited } from "./request-policy";

/**
 * The auth route's limits on `/api/auth/oauth2/register`
 * (src/app/api/auth/[...all]/route.ts): a per-network hourly limit, a cap on
 * the apps one network registered that nobody approved yet (evicted ones
 * included), and the cap on all unapproved apps. Each successful
 * registration is tagged with the network that made it, and when the pool is
 * over its cap the oldest unapproved app past the grace period is evicted to
 * make room. Its client id then fails like any unknown client.
 */

function poolResponse(refusal: PoolRefusal): Response {
  return oauthErrorResponse(refusal.status, refusal.error, refusal.description, { "Retry-After": String(refusal.retryAfterSeconds) });
}

async function refuseRegistration(network: string): Promise<Response | null> {
  const decision = await hitRateLimit("oauthRegister", network);
  if (!decision.allowed) return oauthRateLimited("oauthRegister", decision.retryAfterSeconds);
  const refusal = registrationPoolRefusal(await unapprovedClientCounts(network), Date.now());
  return refusal ? poolResponse(refusal) : null;
}

/** Evicts what the new app pushed over the cap; returns false when nothing could go and the new app was dropped instead. */
async function makeRoom(clientId: string): Promise<boolean> {
  const evicted = await evictOldestUnapproved(clientId);
  for (const { network } of evicted) {
    if (network) await countRateLimitHit("oauthEvictedByNetwork", network);
  }
  return !(await dropIfPoolOverCap(clientId));
}

/** Tags the new app with its network and makes room for it. Returns a refusal to send instead of Better Auth's answer, or null. */
async function settleRegistration(response: Response, network: string): Promise<Response | null> {
  try {
    const clientId = registeredClientId(await response.clone().json());
    if (!clientId) return null;
    await markClientNetwork(clientId, network);
    if (await makeRoom(clientId)) return null;
    return poolResponse(fullPoolRefusal(oauthLimits.unapprovedEvictionGraceMinutes * 60));
  } catch (error) {
    console.error("[oauth] Settling a registration failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/**
 * Registers an app through `answer` (Better Auth's handler) within the
 * limits. Refusals keep the OAuth error shape with Retry-After. The checks
 * fail open, like the other OAuth limits; an app that could not be tagged
 * simply does not count toward its network's cap.
 */
export async function handleRegistration(request: Request, answer: (request: Request) => Promise<Response>): Promise<Response> {
  let network: string | null = null;
  try {
    network = networkKey(request.headers);
    const refusal = await refuseRegistration(network);
    if (refusal) return refusal;
  } catch (error) {
    console.error("[oauth] Registration limit check failed", error instanceof Error ? error.name : "unknown error");
  }
  const response = await answer(request);
  if (!network || response.status !== 201) return response;
  return (await settleRegistration(response, network)) ?? response;
}
