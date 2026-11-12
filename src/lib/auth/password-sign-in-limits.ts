import { createHmac } from "node:crypto";

import { z } from "zod";

import type { RateLimitCheck } from "@/lib/abuse/rate-limit";

/**
 * Password sign-in limits, counted in Postgres like the sign-in link limits
 * (magic-link-limits.ts): Better Auth's own limit lives in each server's
 * memory, so on serverless it barely holds. Email addresses are keyed with
 * the server secret (HMAC), never stored raw or as a plain hash.
 */

/** True for a request that signs in with an email and password. */
export function isPasswordSignInRequest(method: string, pathname: string): boolean {
  return method === "POST" && pathname.replace(/\/+$/, "") === "/api/auth/sign-in/email";
}

/** True when the request body is JSON, the only kind the sign-in forms send. Other kinds are refused before Better Auth reads them. */
export function isJsonRequest(contentType: string | null): boolean {
  return contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

const bodySchema = z.object({ email: z.string().trim().min(1).max(320) });

/** The address a password sign-in is for, lowercased, or null when the body has none. */
export function passwordSignInEmail(body: unknown): string | null {
  const parsed = bodySchema.safeParse(body);
  return parsed.success ? parsed.data.email.toLowerCase() : null;
}

function keyed(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

/**
 * The limits counted on every try, before Better Auth answers: per network
 * (15 minutes and a day; `networkKey` from networkPrefixKey, so an IPv6
 * client counts by its /64), and per network and address together when there
 * is an address. None depends on whether the address has an account.
 */
export function passwordSignInChecks(networkKey: string, email: string | null, secret: string): RateLimitCheck[] {
  const checks: RateLimitCheck[] = [
    { name: "passwordSignInByNetwork", subject: networkKey },
    { name: "passwordSignInByNetworkDay", subject: networkKey },
  ];
  if (email) checks.push({ name: "passwordSignInByNetworkEmail", subject: keyed(secret, `password-network-email:${networkKey}:${email}`) });
  return checks;
}

/** The key failed sign-ins for this address are counted under, from every network (passwordSignInFailuresByEmail). */
export function passwordFailureKey(email: string, secret: string): string {
  return keyed(secret, `password-failures:${email}`);
}

/**
 * The `rate_limit_bucket.key` that address's failures are stored under
 * (`<limit name>:<subject>`, as rate-limit.ts writes it). The owner's reset
 * script deletes it, so a new password also lifts the failure ceiling.
 * `create-reviewer-account.db.test.ts` fails if the two ever disagree.
 */
export function passwordFailureBucketKey(email: string, secret: string): string {
  return `passwordSignInFailuresByEmail:${passwordFailureKey(email.toLowerCase(), secret)}`;
}
