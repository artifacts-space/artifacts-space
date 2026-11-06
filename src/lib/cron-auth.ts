import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * True when a request carries Vercel Cron's `Authorization: Bearer <CRON_SECRET>`.
 * Compares in constant time, and refuses everything while the secret is unset or short.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice(7)), digest(secret));
}
