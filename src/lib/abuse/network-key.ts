import { createHash } from "node:crypto";

/**
 * The visitor's network address from proxy headers. Vercel sets
 * x-forwarded-for with the client first and x-real-ip; anything else is
 * "unknown", which then shares one rate limit.
 */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * A stable, non-reversible key for the visitor's network, for rate limits and
 * report records. Raw addresses are never stored.
 */
export function networkKey(headers: Pick<Headers, "get">, secret = process.env.BETTER_AUTH_SECRET ?? ""): string {
  return createHash("sha256").update(`${secret}:${clientAddress(headers)}`).digest("hex").slice(0, 32);
}
