import { networkPrefixKey } from "@/lib/abuse/network-key";
import { hitRateLimit } from "@/lib/abuse/rate-limit";

import { oauthLimits } from "./config";
import { forgetApprovedClientNetworks, markClientNetwork, trimUnapproved, unapprovedClientCounts } from "./limit-store";
import { fullPoolRefusal, networkShareRefusal, registeredClientId, registrationPoolRefusal, type PoolRefusal } from "./registration-limit-rules";
import { oauthErrorResponse, oauthRateLimited } from "./request-policy";

/**
 * The auth route's limits on `/api/auth/oauth2/register`
 * (src/app/api/auth/[...all]/route.ts): a per-network hourly limit, a cap on
 * the apps one network registered that nobody approved yet (its share), and
 * the cap on all unapproved apps (the pool). Each successful registration is
 * tagged with the network that made it; when its share is over the cap, the
 * network's own oldest unapproved app past the grace period is evicted, and
 * then the pool's oldest when the pool is over. An evicted client id then
 * fails like any unknown client. The registration is refused only when
 * nothing is old enough to evict.
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

const graceSeconds = oauthLimits.unapprovedEvictionGraceMinutes * 60;

/**
 * Tags the new app with its network and makes room for it. Returns a refusal
 * to send instead of Better Auth's answer, or null. The new app is read from
 * the answer's client_id, not from its status code: any success that names a
 * stored app is settled, and one that names none is logged, because that app
 * would count toward no network's share.
 */
async function settleRegistration(response: Response, network: string): Promise<Response | null> {
  try {
    const clientId = registeredClientId(await response.clone().json());
    if (!clientId) {
      console.error("[oauth] A successful registration answer named no client, so it was not counted", response.status);
      return null;
    }
    await markClientNetwork(clientId, network);
    if ((await trimUnapproved(clientId, { kind: "network", network })).dropped) return poolResponse(networkShareRefusal(graceSeconds));
    if ((await trimUnapproved(clientId, { kind: "pool" })).dropped) return poolResponse(fullPoolRefusal(graceSeconds));
    return null;
  } catch (error) {
    console.error("[oauth] Settling a registration failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

/** Whether a POST path is the consent decision the approval page sends (src/components/oauth/consent-form.tsx). */
export function isConsentDecision(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/api/auth/oauth2/consent";
}

/**
 * Answers a consent decision through `answer` (Better Auth's handler), then
 * forgets the registering network of apps now approved: the tag only serves
 * the cap on unapproved apps. Fails open.
 */
export async function handleConsent(request: Request, answer: (request: Request) => Promise<Response>): Promise<Response> {
  const response = await answer(request);
  if (!response.ok) return response;
  try {
    await forgetApprovedClientNetworks();
  } catch (error) {
    console.error("[oauth] Clearing approved app networks failed", error instanceof Error ? error.name : "unknown error");
  }
  return response;
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
    network = networkPrefixKey(request.headers);
    const refusal = await refuseRegistration(network);
    if (refusal) return refusal;
  } catch (error) {
    console.error("[oauth] Registration limit check failed", error instanceof Error ? error.name : "unknown error");
  }
  const response = await answer(request);
  if (!network || !response.ok) return response;
  return (await settleRegistration(response, network)) ?? response;
}
