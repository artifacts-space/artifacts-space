import { networkKeySecret, networkPrefixKey } from "@/lib/abuse/network-key";
import { countRateLimitHit, hitRateLimits, peekRateLimit, rateLimitMessage, type RateLimitRefusal } from "@/lib/abuse/rate-limit";
import { isJsonRequest, passwordFailureKey, passwordSignInChecks, passwordSignInEmail } from "@/lib/auth/password-sign-in-limits";

/**
 * The auth route's handling of `/api/auth/sign-in/email`
 * (src/app/api/auth/[...all]/route.ts): limits before Better Auth answers,
 * and failures counted after. Kept apart from the route so it can be tested
 * with the counters and Better Auth stubbed at their boundary.
 */

const noStore = { "Cache-Control": "no-store" };

function refusalResponse(refusal: RateLimitRefusal): Response {
  return Response.json(
    { code: "RATE_LIMITED", message: rateLimitMessage(refusal.name, refusal.retryAfterSeconds) },
    { status: 429, headers: { ...noStore, "Retry-After": String(refusal.retryAfterSeconds) } },
  );
}

/** Counts a refusal from the failure ceiling without counting this try toward it. */
async function failureCeilingRefusal(failureKey: string | null): Promise<RateLimitRefusal | null> {
  if (!failureKey) return null;
  const decision = await peekRateLimit("passwordSignInFailuresByEmail", failureKey);
  return decision.allowed ? null : { name: "passwordSignInFailuresByEmail", retryAfterSeconds: decision.retryAfterSeconds };
}

/** The limits before Better Auth runs: a 429 to send, or the key to count a failure under (null without an address). */
async function checkLimits(request: Request): Promise<{ refused: Response } | { failureKey: string | null }> {
  const body: unknown = await request.clone().json().catch(() => null);
  const email = passwordSignInEmail(body);
  const secret = networkKeySecret();
  const failureKey = email ? passwordFailureKey(email, secret) : null;
  const refusal = (await hitRateLimits(passwordSignInChecks(networkPrefixKey(request.headers, secret), email, secret))) ?? (await failureCeilingRefusal(failureKey));
  return refusal ? { refused: refusalResponse(refusal) } : { failureKey };
}

async function countFailure(failureKey: string) {
  try {
    await countRateLimitHit("passwordSignInFailuresByEmail", failureKey);
  } catch (error) {
    console.error("[auth] Counting a failed password sign-in failed", error instanceof Error ? error.name : "unknown error");
  }
}

/**
 * Signs in with a password through `answer` (Better Auth's handler), within
 * the limits: per network (an IPv6 client by its /64), per network and
 * address, and a high per-address ceiling on failures, counted only when
 * Better Auth answers 401, so a refused try never counts and nobody else's
 * tries from their own network can lock a reviewer out. Known and unknown
 * addresses are counted alike. Only JSON bodies are taken, so no form post
 * skips the per-address limits. The checks fail closed: without the
 * counters, guessing would be unlimited, and sign-in needs the same database.
 */
export async function handlePasswordSignIn(request: Request, answer: (request: Request) => Promise<Response>): Promise<Response> {
  if (!isJsonRequest(request.headers.get("content-type"))) {
    return Response.json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Send the sign-in as JSON." }, { status: 415, headers: noStore });
  }
  let limits: Awaited<ReturnType<typeof checkLimits>>;
  try {
    limits = await checkLimits(request);
  } catch (error) {
    console.error("[auth] Password sign-in limit check failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ code: "SIGN_IN_UNAVAILABLE", message: "Password sign-in is not working right now. Try again in a few minutes." }, { status: 503, headers: noStore });
  }
  if ("refused" in limits) return limits.refused;
  const response = await answer(request);
  if (response.status === 401 && limits.failureKey) await countFailure(limits.failureKey);
  return response;
}
