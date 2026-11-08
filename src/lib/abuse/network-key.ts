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

/** Thrown when network keys cannot be made safely: the hashing secret is missing. */
export class MissingNetworkKeySecretError extends Error {
  constructor() {
    super("BETTER_AUTH_SECRET is not set, so network addresses cannot be hashed for rate limits and reports. Set it before serving requests.");
    this.name = "MissingNetworkKeySecretError";
  }
}

/**
 * The secret network keys are hashed with. Read on each use, never at import
 * time, so the build needs no secrets. Throws when it is missing or blank:
 * without it, a key is a plain hash of the address, which anyone can reverse
 * by hashing every IPv4 address.
 */
export function networkKeySecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new MissingNetworkKeySecretError();
  return secret;
}

/**
 * A stable, non-reversible key for the visitor's network, for rate limits and
 * report records. Raw addresses are never stored. Throws
 * MissingNetworkKeySecretError when there is no secret to hash with.
 */
export function networkKey(headers: Pick<Headers, "get">, secret?: string): string {
  const key = secret ?? networkKeySecret();
  if (!key.trim()) throw new MissingNetworkKeySecretError();
  return createHash("sha256").update(`${key}:${clientAddress(headers)}`).digest("hex").slice(0, 32);
}
