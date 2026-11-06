import { createHash } from "node:crypto";

import { z } from "zod";

import type { RateLimitCheck } from "@/lib/abuse/rate-limit";

/**
 * Sign-in link abuse limits. Better Auth's own limit lives in each server's
 * memory, so on serverless it barely holds; these are counted in Postgres.
 * Every link is an email, and a flood would use up the Sendir quota that
 * everyone's sign-in depends on.
 */

/** True for the request that emails a sign-in link. */
export function isMagicLinkRequest(method: string, pathname: string): boolean {
  return method === "POST" && pathname.replace(/\/+$/, "") === "/api/auth/sign-in/magic-link";
}

const bodySchema = z.object({ email: z.string().trim().min(1).max(320) });

/** The address a sign-in link request is for, lowercased, or null when the body has none. */
export function magicLinkEmail(body: unknown): string | null {
  const parsed = bodySchema.safeParse(body);
  return parsed.success ? parsed.data.email.toLowerCase() : null;
}

/** The limits for one sign-in link request: per network, and per address when there is one (hashed, never stored raw). */
export function magicLinkChecks(networkKey: string, email: string | null): RateLimitCheck[] {
  const checks: RateLimitCheck[] = [{ name: "magicLinkByNetwork", subject: networkKey }];
  if (email) checks.push({ name: "magicLinkByEmail", subject: createHash("sha256").update(email).digest("hex").slice(0, 32) });
  return checks;
}
