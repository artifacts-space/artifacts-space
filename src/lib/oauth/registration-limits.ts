import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimit } from "@/lib/abuse/rate-limit";

import { markClientNetwork, unapprovedClientCounts } from "./limit-store";
import { registeredClientId, registrationPoolRefusal } from "./registration-limit-rules";
import { oauthErrorResponse, oauthRateLimited } from "./request-policy";

/**
 * The auth route's limits on `/api/auth/oauth2/register`
 * (src/app/api/auth/[...all]/route.ts): a per-network hourly limit, a cap on
 * the apps one network registered that nobody approved yet, and the cap on
 * all unapproved apps. Each successful registration is then tagged with the
 * network that made it, so the per-network cap can count it.
 */

async function refuseRegistration(network: string): Promise<Response | null> {
  const decision = await hitRateLimit("oauthRegister", network);
  if (!decision.allowed) return oauthRateLimited("oauthRegister", decision.retryAfterSeconds);
  const refusal = registrationPoolRefusal(await unapprovedClientCounts(network), Date.now());
  if (!refusal) return null;
  return oauthErrorResponse(refusal.status, refusal.error, refusal.description, { "Retry-After": String(refusal.retryAfterSeconds) });
}

async function tagRegistration(response: Response, network: string): Promise<void> {
  try {
    const clientId = registeredClientId(await response.clone().json());
    if (clientId) await markClientNetwork(clientId, network);
  } catch (error) {
    console.error("[oauth] Tagging a registration failed", error instanceof Error ? error.name : "unknown error");
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
  if (network && response.status === 201) await tagRegistration(response, network);
  return response;
}
