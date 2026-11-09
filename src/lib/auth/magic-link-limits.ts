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

/**
 * The limits for one sign-in link request: per network (a one-minute burst
 * window, a 15-minute window, and a daily ceiling), and per address when
 * there is one (a minute and an hour; hashed, never stored raw). Network
 * limits come first, so a scripted burst is refused with the network's
 * message. None of them depends on whether the address has an account, so a
 * refusal reveals nothing about who has signed up.
 */
export function magicLinkChecks(networkKey: string, email: string | null): RateLimitCheck[] {
  const checks: RateLimitCheck[] = [
    { name: "magicLinkByNetworkMinute", subject: networkKey },
    { name: "magicLinkByNetwork", subject: networkKey },
    { name: "magicLinkByNetworkDay", subject: networkKey },
  ];
  if (!email) return checks;
  const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);
  checks.push({ name: "magicLinkByEmailMinute", subject: emailKey }, { name: "magicLinkByEmail", subject: emailKey });
  return checks;
}
