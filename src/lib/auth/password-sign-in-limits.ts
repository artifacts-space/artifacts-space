import { createHash } from "node:crypto";

import { z } from "zod";

import type { RateLimitCheck } from "@/lib/abuse/rate-limit";

/**
 * Password sign-in limits, counted in Postgres like the sign-in link limits
 * (magic-link-limits.ts): Better Auth's own limit lives in each server's
 * memory, so on serverless it barely holds.
 */

/** True for a request that signs in with an email and password. */
export function isPasswordSignInRequest(method: string, pathname: string): boolean {
  return method === "POST" && pathname.replace(/\/+$/, "") === "/api/auth/sign-in/email";
}

/** True when the request body is JSON, the only kind the sign-in form sends. Other kinds are refused before Better Auth reads them. */
export function isJsonRequest(contentType: string | null): boolean {
  return contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

const bodySchema = z.object({ email: z.string().trim().min(1).max(320) });

/** The address a password sign-in is for, lowercased, or null when the body has none. */
export function passwordSignInEmail(body: unknown): string | null {
  const parsed = bodySchema.safeParse(body);
  return parsed.success ? parsed.data.email.toLowerCase() : null;
}

/**
 * The limits for one password sign-in: per network (15 minutes and a day),
 * and per address when there is one (hashed, never stored raw). None of them
 * depends on whether the address has an account or a password, so a refusal
 * reveals nothing about either.
 */
export function passwordSignInChecks(networkKey: string, email: string | null): RateLimitCheck[] {
  const checks: RateLimitCheck[] = [
    { name: "passwordSignInByNetwork", subject: networkKey },
    { name: "passwordSignInByNetworkDay", subject: networkKey },
  ];
  if (!email) return checks;
  const emailKey = createHash("sha256").update(`password:${email}`).digest("hex").slice(0, 32);
  checks.push({ name: "passwordSignInByEmail", subject: emailKey }, { name: "passwordSignInByEmailDay", subject: emailKey });
  return checks;
}
